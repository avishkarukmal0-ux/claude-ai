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

module.exports = { isActive, getEntitlement, hasAccess, setEntitlement, DEFAULT };
