'use strict';

// Adapter contract / sandbox-readiness (POS slice 5). Every one of the 9 adapters must stay HONEST while its
// provider is not yet verified against a sandbox: no live operation may succeed, nothing may be faked. These
// invariants are what let the cloud scaffolding (slice 4) be deployed safely — the adapters are the single
// place a live call would ever happen, and here we prove they all still refuse.
const pos = require('../services/posProviders');
const { ProviderNotAvailableError, ProviderNotImplementedError } = require('../services/posProviders/adapterBase');

const ALL = pos.PROVIDERS.map((p) => p.id);

describe('POS adapters — honest contract for every provider', () => {
  test('there is exactly one adapter per catalogued provider', () => {
    expect(ALL.length).toBe(9);
    for (const id of ALL) expect(pos.getAdapter(id)).toBeTruthy();
  });

  test.each(ALL)('"%s": every live operation refuses (never fakes a connection)', async (id) => {
    const a = pos.getAdapter(id);
    await expect(a.connect({})).rejects.toBeInstanceOf(ProviderNotAvailableError);
    await expect(a.disconnect({})).rejects.toBeInstanceOf(ProviderNotAvailableError);
    await expect(a.fetchSales({})).rejects.toBeInstanceOf(ProviderNotAvailableError);
    await expect(a.verifyWebhook({})).rejects.toBeInstanceOf(ProviderNotAvailableError);
  });

  test.each(ALL)('"%s": normalizeSale is not faked (throws until sandbox-verified)', (id) => {
    expect(() => pos.getAdapter(id).normalizeSale({})).toThrow(ProviderNotImplementedError);
  });

  test.each(ALL)('"%s": capabilities + canConnect() match the registry (no drift)', (id) => {
    const a = pos.getAdapter(id);
    const meta = pos.getProvider(id);
    const caps = a.capabilities();
    expect(caps.connectionMethods).toEqual(meta.connectionMethods);
    expect(caps.itemLevel).toBe(meta.itemLevel);
    expect(caps.requiresApproval).toBe(!!meta.requiresApproval);
    expect(a.availability()).toBe(meta.availability);
    // canConnect() is true ONLY for ready_for_testing providers — the gate the cloud service relies on.
    expect(a.canConnect()).toBe(meta.availability === 'ready_for_testing');
  });

  test('exactly the documented providers are ready-for-testing (the rest cannot be connected)', () => {
    const ready = ALL.filter((id) => pos.getAdapter(id).canConnect()).sort();
    expect(ready).toEqual(['eposnow', 'shopify', 'square', 'zettle']);
  });
});
