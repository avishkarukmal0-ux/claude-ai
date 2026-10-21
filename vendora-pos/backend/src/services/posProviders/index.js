'use strict';

// POS-integration foundation — single entry point.
//   registry    → provider AVAILABILITY catalogue (no secrets; safe to serve to the client)
//   salesModel  → the shared normalized sale/line shape every adapter maps into
//   adapters    → one module per provider (live ops disabled until access + credentials + verification)
//
// Nothing here mutates stock. Turning normalized sales into stock movements is a later, separately-gated
// step (comparison mode first, then explicit owner opt-in) — see obsidian-vault/Integrations/
// Sales-Ingestion-Design.md.
const registry = require('./registry');
const salesModel = require('./salesModel');

const adapters = {};
for (const p of registry.PROVIDERS) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  adapters[p.id] = require(`./adapters/${p.id}`);
}

function getAdapter(id) { return adapters[id] || null; }
function listAdapters() { return registry.PROVIDERS.map((p) => adapters[p.id]); }

module.exports = {
  ...registry,       // AVAIL, CONNECTION, PROVIDERS, listProviders, getProvider, testableProviders, csvCapableProviders
  salesModel,
  getAdapter,
  listAdapters,
};
