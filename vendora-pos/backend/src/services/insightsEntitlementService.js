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
    case 'resumed':
      return {
        ...map,
        status: 'active',
        source: event.source || current.source || 'stripe',
        reference: event.reference || current.reference || null,
        grantedAt: current.grantedAt || now,
        currentPeriodEnd: event.currentPeriodEnd != null ? event.currentPeriodEnd : current.currentPeriodEnd,
        cancelledAt: null,
      };
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

  const patch = entitlementPatchFor(event, current, now);
  if (!patch) { await recordProcessed(event, accountId); return { ok: true, skipped: true, reason: 'no_patch' }; }
  const ent = await setEntitlement(accountId, patch);
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
};
