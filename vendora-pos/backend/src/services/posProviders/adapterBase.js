'use strict';

// Common adapter contract for every POS provider. Each provider has its own module under ./adapters that
// builds on this factory. REAL cloud operations (connect/fetchSales/verifyWebhook) are DISABLED here and
// throw — an adapter only does real work once its provider has documented access AND we hold the shop's
// credentials AND the mapping is verified against a sandbox/fixture. We never fake a successful connection,
// invent an endpoint, or represent a fixture as a live integration.
const { getProvider } = require('./registry');

class ProviderNotAvailableError extends Error {
  constructor(id, reason) {
    super(`POS provider "${id}" is not available: ${reason}`);
    this.name = 'ProviderNotAvailableError';
    this.code = 'PROVIDER_NOT_AVAILABLE';
    this.statusCode = 501;
    this.providerId = id;
    this.reason = reason;
  }
}
class ProviderNotImplementedError extends Error {
  constructor(id, what) {
    super(`POS provider "${id}": ${what}`);
    this.name = 'ProviderNotImplementedError';
    this.code = 'PROVIDER_NOT_IMPLEMENTED';
    this.statusCode = 501;
    this.providerId = id;
  }
}

/**
 * Build the base adapter for a provider id from its registry entry. Adapter modules call this and may
 * override `normalizeSale` once the provider's native sale shape is verified against its sandbox. Until
 * then every network/credential operation throws (honest "not available"), carrying the registry's reason.
 */
function createAdapter(id, overrides = {}) {
  const meta = getProvider(id);
  if (!meta) throw new Error(`Unknown POS provider: ${id}`);
  const reason = (meta.blockers && meta.blockers[0]) || `availability: ${meta.availability}`;

  const base = {
    id,
    meta,
    /** Provider-level availability (NOT a shop's connection status). */
    availability() { return meta.availability; },
    capabilities() {
      return {
        connectionMethods: meta.connectionMethods,
        itemLevel: meta.itemLevel,
        realtime: meta.realtime,
        auth: meta.auth,
        requiresApproval: meta.requiresApproval,
      };
    },
    /** Can we even attempt a live cloud connection for this provider today? */
    canConnect() { return meta.availability === 'ready_for_testing'; },

    // ── Live operations — disabled until access + credentials + sandbox verification exist ──
    async connect() { throw new ProviderNotAvailableError(id, reason); },
    async disconnect() { throw new ProviderNotAvailableError(id, reason); },
    async fetchSales() { throw new ProviderNotAvailableError(id, reason); },
    async verifyWebhook() { throw new ProviderNotAvailableError(id, reason); },

    /** Map provider-native sale data → the shared salesModel. Overridden per-adapter once verified; throws
     *  until then rather than guess a field shape. */
    normalizeSale() { throw new ProviderNotImplementedError(id, 'normalizeSale is not verified against a sandbox yet'); },
  };
  return { ...base, ...overrides };
}

module.exports = { createAdapter, ProviderNotAvailableError, ProviderNotImplementedError };
