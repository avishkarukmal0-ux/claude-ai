'use strict';

// POS cloud-connection service (sales-import slice 4) — DEFERRED SCAFFOLDING, honest and inert by default.
//
// What this IS: the server-side plumbing a real cloud connection will use — per-shop connection records,
// an idempotent durable sale-event queue, and the connect/callback/webhook entry points — all gated so that
// until a provider is accredited and we actually hold its credentials, every live path reports "not available
// yet" instead of faking a connection, inventing an endpoint, or representing a fixture as real.
//
// What this is NOT: it never makes a live provider call (the adapters throw until verified), never stores a
// token in the clear (secretBox + POS_TOKEN_KEY), and never mutates stock (enqueuing captures an event; the
// opt-in deduction path — slice 3 — is the only thing that touches stock, and only on the owner's say-so).
const config = require('../config');
const AppError = require('../utils/AppError');
const pos = require('./posProviders');
const secretBox = require('../utils/secretBox');
const { PosConnection } = require('../models/PosConnection');
const { PosSaleEvent } = require('../models/PosSaleEvent');

/** Is the cloud-connection feature switched on at all? Default OFF. */
function cloudEnabled() { return !!config.posCloud.enabled; }

/** Env credential names for a provider (none are shipped — a real deployment sets these per accredited shop). */
function credEnv(providerId) {
  const P = String(providerId).toUpperCase();
  return {
    clientId: process.env[`POS_${P}_CLIENT_ID`] || '',
    clientSecret: process.env[`POS_${P}_CLIENT_SECRET`] || '',
    webhookSecret: process.env[`POS_${P}_WEBHOOK_SECRET`] || '',
  };
}

/**
 * Can we attempt a REAL cloud connection for this provider right now? Requires ALL of:
 *  - the feature flag on,
 *  - an encryption key present (so a token could be stored safely),
 *  - the provider's adapter says it's connectable (availability = ready_for_testing),
 *  - its OAuth credentials are actually configured.
 * With none shipped, this is false for every provider — the honest default.
 */
function providerConfigured(providerId) {
  if (!cloudEnabled()) return false;
  if (!secretBox.isAvailable(config.posCloud.tokenKey)) return false;
  const adapter = pos.getAdapter(providerId);
  if (!adapter || !adapter.canConnect()) return false;
  const { clientId, clientSecret } = credEnv(providerId);
  return !!(clientId && clientSecret);
}

/** Why a provider can't be connected yet — a plain, honest reason for the client/logs (no secrets). */
function unavailableReason(providerId) {
  const meta = pos.getProvider(providerId);
  if (!meta) return 'Unknown provider';
  if (!cloudEnabled()) return 'Direct till connections are not switched on yet';
  if (!adapterConnectable(providerId)) return (meta.blockers && meta.blockers[0]) || `availability: ${meta.availability}`;
  if (!secretBox.isAvailable(config.posCloud.tokenKey)) return 'Secure token storage is not configured on the server';
  return 'This till is not configured on the server yet';
}
function adapterConnectable(providerId) {
  const a = pos.getAdapter(providerId);
  return !!(a && a.canConnect());
}

/** List a shop's connections (non-secret view). Empty until a real connection exists. */
async function listConnections(accountId) {
  const rows = await PosConnection.find({ account: accountId }).sort({ provider: 1 });
  return { connections: rows.map((r) => r.toClient()) };
}

/**
 * Begin a cloud connection (OAuth). Owner/manager only (enforced at the route). Because no provider is
 * configured, this ALWAYS throws the honest "not available" — we never return a fabricated authorize URL.
 * Once a provider is genuinely configured, this is where we'd build its real authorize URL from the adapter.
 */
async function startConnect(accountId, providerId) {
  const meta = pos.getProvider(providerId);
  if (!meta) throw new AppError('Unknown till provider', 404, 'POS_UNKNOWN_PROVIDER');
  if (!providerConfigured(providerId)) {
    throw new AppError(unavailableReason(providerId), 503, 'POS_NOT_AVAILABLE', { provider: providerId });
  }
  // Reached only when real credentials exist. The adapter's connect() is the single place a live call happens;
  // until it's implemented+verified it throws ProviderNotAvailableError — we surface that, never fake a URL.
  const adapter = pos.getAdapter(providerId);
  const { clientId } = credEnv(providerId);
  return adapter.connect({ clientId, callbackBaseUrl: config.posCloud.callbackBaseUrl, accountId });
}

/**
 * Handle the OAuth redirect back. Same gating: honest "not available" until a provider is configured and its
 * adapter verified. When live, this would verify `state` (CSRF), exchange `code` via the adapter, encrypt the
 * token with secretBox, and upsert a PosConnection. It never stores a token in the clear.
 */
async function handleCallback(accountId, providerId /* , { code, state } */) {
  const meta = pos.getProvider(providerId);
  if (!meta) throw new AppError('Unknown till provider', 404, 'POS_UNKNOWN_PROVIDER');
  if (!providerConfigured(providerId)) {
    throw new AppError(unavailableReason(providerId), 503, 'POS_NOT_AVAILABLE', { provider: providerId });
  }
  throw new AppError('This till connection is not available yet', 503, 'POS_NOT_AVAILABLE', { provider: providerId });
}

/**
 * Receive a provider webhook. Signature verification is delegated to the adapter's documented mechanism; until
 * a provider is configured+verified, the endpoint behaves as if it doesn't exist (caller returns 404) so we
 * never accept unverified data. On a real verified event it would enqueue idempotently via enqueueEvent.
 * @returns { accepted: boolean, reason?: string }
 */
async function receiveWebhook(providerId, { rawBody, headers } = {}) {
  if (!providerConfigured(providerId)) return { accepted: false, reason: 'not_configured' };
  const adapter = pos.getAdapter(providerId);
  const { webhookSecret } = credEnv(providerId);
  // Throws ProviderNotAvailableError until the adapter's verifyWebhook is implemented against the provider's
  // documented signing scheme — we never trust an unverified payload.
  await adapter.verifyWebhook({ rawBody, headers, secret: webhookSecret });
  // (Unreachable today.) A verified event would be normalized by the adapter and enqueued here.
  return { accepted: false, reason: 'no_handler' };
}

/**
 * Durable, idempotent enqueue of ONE captured sale (or line) event. Idempotency is the unique (account,
 * dedupeKey) index: a re-delivery is a no-op that returns the existing row. Never throws on a duplicate.
 * Does NOT process into stock. `dedupeKey` should be salesModel.saleKey/lineKey.
 * @returns { enqueued: boolean, duplicate: boolean }
 */
async function enqueueEvent(accountId, providerId, { dedupeKey, payload = null, occurredAt = null }) {
  if (!dedupeKey) throw new AppError('A sale dedupe key is required to enqueue', 400, 'POS_NO_DEDUPE_KEY');
  try {
    await PosSaleEvent.create({ account: accountId, provider: providerId, dedupeKey, payload, occurredAt, status: 'pending' });
    return { enqueued: true, duplicate: false };
  } catch (err) {
    if (err && err.code === 11000) return { enqueued: false, duplicate: true }; // unique index → already captured
    throw err;
  }
}

/** Mark a queued event processed (idempotent worker bookkeeping). Stock is NOT touched here. */
async function markProcessed(accountId, dedupeKey, { status = 'processed', error = '' } = {}) {
  const res = await PosSaleEvent.updateOne(
    { account: accountId, dedupeKey },
    { $set: { status, processedAt: Date.now(), lastError: error }, $inc: { attempts: 1 } },
  );
  return { updated: res.modifiedCount || res.nModified || 0 };
}

module.exports = {
  cloudEnabled,
  providerConfigured,
  unavailableReason,
  listConnections,
  startConnect,
  handleCallback,
  receiveWebhook,
  enqueueEvent,
  markProcessed,
  // exported for tests
  credEnv,
};
