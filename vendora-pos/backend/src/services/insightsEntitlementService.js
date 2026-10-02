'use strict';

// Neighbourhood Insights — paid entitlement (server-enforced, scoped to the shop account). This is the ONLY
// authority on access: the client cannot grant itself access by flipping a flag. The entitlement lives on the
// PwaAccount (`entitlements.neighbourhoodInsights`); granting it is the billing provider's job (Phase 4) and
// is OFF until a provider is configured, so by default no account has access and purchasing is unavailable.
const Account = require('../models/Account');

const DEFAULT = { status: 'none', source: null, reference: null, grantedAt: null, currentPeriodEnd: null, cancelledAt: null, note: '' };

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

function entitlementPatchFor(event, current = DEFAULT, now = Date.now()) {
  if (!event || !EVENT_TYPES.includes(event.type)) return null;
  switch (event.type) {
    case 'purchased':
    case 'renewed':
    case 'resumed':
      return {
        status: 'active',
        source: event.source || current.source || null,
        reference: event.reference || current.reference || null,
        grantedAt: current.grantedAt || now,
        currentPeriodEnd: event.currentPeriodEnd != null ? event.currentPeriodEnd : current.currentPeriodEnd,
        cancelledAt: null,
      };
    case 'payment_failed':
      return { status: 'past_due' };
    case 'cancelled':
      return { cancelledAt: now }; // keep status/currentPeriodEnd — access lapses at period end
    case 'ended':
      return { status: 'cancelled', currentPeriodEnd: now };
    default:
      return null;
  }
}

/** Apply a normalised billing event to an account's entitlement. @returns the new entitlement or null. */
async function applyBillingEvent(accountId, event, now = Date.now()) {
  const current = await getEntitlement(accountId);
  const patch = entitlementPatchFor(event, current, now);
  if (!patch) return null;
  return setEntitlement(accountId, patch);
}

module.exports = { isActive, getEntitlement, hasAccess, setEntitlement, entitlementPatchFor, applyBillingEvent, EVENT_TYPES, DEFAULT };
