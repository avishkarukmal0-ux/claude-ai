import { describe, it, expect, afterEach } from 'vitest';
import { getProviders, __setPosTransport } from '../posClient';

afterEach(() => { __setPosTransport(null); });

describe('posClient.getProviders — honest, degrade-not-fake', () => {
  it('passes the catalogue through with ok:true on success', async () => {
    __setPosTransport(async () => ({
      success: true, docsCheckedAt: '2026-10-21', liveMethods: ['csv'],
      providers: [{ id: 'square', name: 'Square', availability: 'ready_for_testing', csvCapable: true }],
      testable: ['square'], csvCapable: ['square'],
    }));
    const res = await getProviders();
    expect(res.ok).toBe(true);
    expect(res.liveMethods).toEqual(['csv']);
    expect(res.providers[0].id).toBe('square');
  });

  it('returns ok:false (never a fake success) when the request throws', async () => {
    __setPosTransport(async () => { throw new Error('boom'); });
    const res = await getProviders();
    expect(res.ok).toBe(false);
    expect(res.error).toBe('boom');
    expect(res.providers).toBeUndefined();
  });

  it('flags a 401 as needsLogin so the screen can prompt sign-in, not blank', async () => {
    __setPosTransport(async () => { const e = new Error('Unauthorized'); e.status = 401; throw e; });
    const res = await getProviders();
    expect(res.ok).toBe(false);
    expect(res.needsLogin).toBe(true);
  });
});
