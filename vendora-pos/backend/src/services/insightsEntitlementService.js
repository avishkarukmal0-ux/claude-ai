'use strict';

// Neighbourhood Insights — paid entitlement (server-enforced, scoped to the shop account). This is the ONLY
// authority on access: the client cannot grant itself access by flipping a flag. The entitlement lives on the
// PwaAccount (`entitlements.neighbourhoodInsights`); granting it is the billing provider's job (Phase 4) and
// is OFF until a provider is configured, so by default no account has access and purchasing is unavailable.
const Account = require('../models/Account');
const ProcessedBillingEvent = require('../models/ProcessedBillingEvent');

const DEFAULT = {
  status: 'none', plan: 'none', source: null, reference: null, grantedAt: null, currentPeriodEnd: null,
  cancelledAt: null, note: '', customerId: null, subscriptionId: null, itemId: null, priceId: null,
  lastEventAt: null, lastEventId: null,
};

/** Pure: is this entitlement currently active? (active status + not past its period end). */
function isActive(ent, now = Date.now()) {
  if (!ent || ent.status !== 'active') return false;
  if (ent.currentPeriodEnd && ent.currentPeriodEnd < now) return false;
  return true;
}

async function getEntitlement(accountId) {
  const acct = await Account.findById(accountId).select('entitlements').lean();
  const e = acct && acct.entitlements && acct.entitlements.neighbourhoodInsights;
  return { ...DEFAULT, ...(e || {}) };
}

/** Server-side access check used by the routes. */
async function hasAccess(accountId, now = Date.now()) {
  return isActive(await getEntitlement(accountId), now);
}

/** Grant/update the entitlement (called by the billing provider on purchase/renewal — Phase 4). */
async function setEntitlement(accountId, patch) {
  const acct = await Account.findById(accountId);
  if (!acct) return null;
  acct.entitlements = acct.entitlements || {};
  acct.entitlements.neighbourhoodInsights = {
    ...DEFAULT,
    ...(acct.entitlements.neighbourhoodInsights ? acct.entitlements.neighbourhoodInsights.toObject?.() || acct.entitlements.neighbourhoodInsights : {}),
    ...patch,
  };
  await acct.save();
  return acct.entitlements.neighbourhoodInsights;
}

const NP = 'entitlements.neighbourhoodInsights'; // nested path

// Audit R5 (round 3): apply a billing event with a COMPARE-AND-SWAP that RECOMPUTES on conflict.
//
// The round-2 path read the entitlement, computed `merged` in Node, then wrote the whole nested object with a
// `lastEventAt $lte` guard. Two real same-second events expose two bugs there: (1) the `merged` value is built
// from a possibly-STALE read, so a grant that read the account BEFORE a same-second 'ended' committed writes an
// 'active' object that never saw the ending; and (2) `$lte` lets that stale grant's write match (T <= T) and
// clobber the committed deny — access stays active after cancellation. The B1 strict-newer tie rule in
// entitlementPatchFor can't help, because the `current` it was given predates the deny.
//
// The fix: guard the write on the EXACT ordering token we read (lastEventId). If a concurrent writer changed it
// between our read and our write, findOneAndUpdate matches 0 docs; we then re-read the now-committed state and
// recompute the patch against it (so the grant now sees status 'cancelled' + an equal timestamp → the B1 rule
// keeps it denied — fail-safe on a tie). Bounded retries; genuinely older events are still skipped.
// @returns {{ ent?, skipped?, reason? }}.
let _afterEntitlementRead = null; // test seam (R5): interpose between read and guarded write to force an interleave
function __setAfterEntitlementRead(fn) { _afterEntitlementRead = fn || null; }
async function setEntitlementCAS(accountId, event, now = Date.now()) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await getEntitlement(accountId);
    // Genuinely older than the stored state → skip (defence in depth; decideIngest also screens this).
    if (event.eventCreatedMs != null && current.lastEventAt != null && event.eventCreatedMs < current.lastEventAt) {
      return { skipped: true, reason: 'stale' };
    }
    const patch = entitlementPatchFor(event, current, now);
    if (!patch) return { skipped: true, reason: 'no_patch' };
    const merged = { ...DEFAULT, ...current, ...patch };
    // One-shot test hook fires on the first read so a test can let a concurrent event commit before we write.
    if (_afterEntitlementRead) { const h = _afterEntitlementRead; _afterEntitlementRead = null; await h(event, current); }
    // CAS: the stored lastEventId must still be exactly what we read (or both unset). A concurrent commit that
    // advanced it makes this match 0 docs → loop re-reads + recomputes against the committed state.
    const guard = { _id: accountId };
    if (current.lastEventId == null) {
      guard.$or = [{ [`${NP}.lastEventId`]: { $exists: false } }, { [`${NP}.lastEventId`]: null }];
    } else {
      guard[`${NP}.lastEventId`] = current.lastEventId;
    }
    // eslint-disable-next-line no-await-in-loop
    const doc = await Account.findOneAndUpdate(guard, { $set: { [NP]: merged } }, { new: true }).lean();
    if (doc) return { ent: doc.entitlements.neighbourhoodInsights };
    // 0 matched → a concurrent writer changed the ordering token; re-read and recompute.
  }
  // Extreme contention only: refuse rather than write a value computed against a superseded state.
  return { skipped: true, reason: 'cas_contention' };
}

// --- billing lifecycle (provider-agnostic) ---------------------------------
// A billing provider adapter normalises its events to one of these types and posts them to the webhook; we
// translate to an entitlement patch here (pure + testable). Access policy (documented):
//   purchased/renewed/resumed → active (+ currentPeriodEnd)
//   payment_failed            → past_due  → access DENIED (strict; a later renewal restores it)
//   cancelled                 → access CONTINUES until currentPeriodEnd (we only stamp cancelledAt)
//   ended                     → cancelled → access denied immediately
const EVENT_TYPES = ['purchased', 'renewed', 'resumed', 'payment_failed', 'cancelled', 'ended'];

// Identifier/mapping fields carried on an event are merged for EVERY type (so a payment_failed still keeps the
// customer/subscription mapping), plus the out-of-order guard stamps (lastEventAt/lastEventId).
function mappingPatch(event) {
  const p = {};
  if (event.source != null) p.source = event.source;
  if (event.plan != null) p.plan = event.plan;
  if (event.customerId != null) p.customerId = event.customerId;
  if (event.subscriptionId != null) p.subscriptionId = event.subscriptionId;
  if (event.itemId !== undefined) p.itemId = event.itemId; // null clears it (add-on removed)
  if (event.priceId != null) p.priceId = event.priceId;
  if (event.reference != null) p.reference = event.reference;
  if (event.eventCreatedMs != null) p.lastEventAt = event.eventCreatedMs;
  if (event.eventId != null) p.lastEventId = event.eventId;
  return p;
}

function entitlementPatchFor(event, current = DEFAULT, now = Date.now()) {
  if (!event || !EVENT_TYPES.includes(event.type)) return null;
  const map = mappingPatch(event);
  switch (event.type) {
    case 'purchased':
    case 'renewed':
    case 'resumed': {
      // Audit B1 (round 2): Stripe `created` is second-resolution and webhook delivery order is NOT guaranteed,
      // so a grant (renew/resume) that shares its second with a terminal deny (ended → 'cancelled', or
      // payment_failed → 'past_due') must not silently reactivate access on ambiguous ordering. Only a grant
      // STRICTLY newer than the event that denied access may reactivate; a tie (equal timestamp) keeps the
      // denied state — fail-safe, and a genuinely later renewal (a newer second) still restores access. Events
      // with no timestamp (the manual webhook) keep prior behaviour.
      const denied = current.status === 'cancelled' || current.status === 'past_due';
      const notStrictlyNewer = event.eventCreatedMs != null && current.lastEventAt != null
        && event.eventCreatedMs <= current.lastEventAt;
      if (denied && notStrictlyNewer) {
        return { ...map, status: current.status }; // keep denied; still merge mapping + ordering stamps
      }
      return {
        ...map,
        status: 'active',
        source: event.source || current.source || 'stripe',
        reference: event.reference || current.reference || null,
        grantedAt: current.grantedAt || now,
        currentPeriodEnd: event.currentPeriodEnd != null ? event.currentPeriodEnd : current.currentPeriodEnd,
        cancelledAt: null,
      };
    }
    case 'payment_failed':
      return { ...map, status: 'past_due' };
    case 'cancelled':
      return { ...map, cancelledAt: now }; // keep status/currentPeriodEnd — access lapses at period end
    case 'ended':
      return { ...map, status: 'cancelled', currentPeriodEnd: now };
    default:
      return null;
  }
}

/**
 * Pure decision for whether to APPLY an incoming provider event, given the current entitlement. Protects
 * against duplicate (same id already applied) and out-of-order (older than the last applied) deliveries.
 * @returns {{ apply:boolean, reason:string }}
 */
function decideIngest(current = DEFAULT, { eventCreatedMs = null, eventId = null } = {}) {
  if (eventId && current.lastEventId && current.lastEventId === eventId) return { apply: false, reason: 'duplicate' };
  if (eventCreatedMs != null && current.lastEventAt != null && eventCreatedMs < current.lastEventAt) {
    return { apply: false, reason: 'stale' };
  }
  return { apply: true, reason: 'ok' };
}

/** Apply a normalised billing event to an account's entitlement. @returns the new entitlement or null. */
async function applyBillingEvent(accountId, event, now = Date.now()) {
  const current = await getEntitlement(accountId);
  const patch = entitlementPatchFor(event, current, now);
  if (!patch) return null;
  return setEntitlement(accountId, patch);
}

/** Resolve the shop account id for a provider customer id (server-side mapping — never from client input). */
async function findAccountIdByCustomer(customerId) {
  if (!customerId) return null;
  const acct = await Account.findOne({ 'entitlements.neighbourhoodInsights.customerId': customerId }).select('_id').lean();
  return acct ? String(acct._id) : null;
}

/**
 * Ingest a normalised, already-authenticated provider event: resolve the shop, drop duplicates (idempotency
 * ledger), ignore stale/out-of-order deliveries, then apply. Safe to call for the same event many times.
 * @returns {{ ok, duplicate?, skipped?, reason?, unresolved?, status? }}
 */
async function ingestProviderEvent(event, now = Date.now()) {
  if (!event || !event.type) return { ok: false, reason: 'bad_event' };
  const accountId = event.accountId || (await findAccountIdByCustomer(event.customerId));
  if (!accountId) return { ok: false, unresolved: true, reason: 'unresolved_account' };

  // Idempotency: a delivery we've already recorded is a no-op (Stripe retries at-least-once).
  if (event.eventId) {
    const seen = await ProcessedBillingEvent.findOne({ eventId: event.eventId }).lean();
    if (seen) return { ok: true, duplicate: true };
  }

  const current = await getEntitlement(accountId);
  const decision = decideIngest(current, { eventCreatedMs: event.eventCreatedMs, eventId: event.eventId });
  if (!decision.apply) {
    await recordProcessed(event, accountId);
    return { ok: true, skipped: true, reason: decision.reason };
  }

  // When the event carries a created-time, apply it with the compare-and-swap applier (R5): it recomputes the
  // patch against the committed state on a concurrent conflict, so a same-second grant can't reactivate a deny.
  // Otherwise (e.g. the generic manual webhook with no timestamp) fall back to the plain read-modify-write.
  let ent;
  if (event.eventCreatedMs != null) {
    const r = await setEntitlementCAS(accountId, event, now);
    if (r.skipped) { await recordProcessed(event, accountId); return { ok: true, skipped: true, reason: r.reason }; }
    ent = r.ent;
  } else {
    const patch = entitlementPatchFor(event, current, now);
    if (!patch) { await recordProcessed(event, accountId); return { ok: true, skipped: true, reason: 'no_patch' }; }
    ent = await setEntitlement(accountId, patch);
  }
  await recordProcessed(event, accountId);
  return { ok: true, status: ent ? ent.status : null, entitled: isActive(ent, now) };
}

async function recordProcessed(event, accountId) {
  if (!event.eventId) return;
  try {
    await ProcessedBillingEvent.create({ eventId: event.eventId, provider: event.source || 'stripe', type: event.type, accountId: String(accountId) });
  } catch { /* unique-key race = already recorded; fine */ }
}

module.exports = {
  isActive, getEntitlement, hasAccess, setEntitlement, entitlementPatchFor, decideIngest,
  applyBillingEvent, ingestProviderEvent, findAccountIdByCustomer, EVENT_TYPES, DEFAULT,
  __setAfterEntitlementRead,
};
