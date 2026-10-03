import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getArea, getStored, __setFetch } from '../neighbourhoodClient';
import { setActiveWorkspace, LOCAL_WORKSPACE, __resetMemForTest } from '../storage';

// FIXTURE (test-only): a mocked backend response. No sample/mock data exists in any production path.
const SAMPLE = { success: true, available: true, postcode: 'RM108AA', area: { ward: 'Alibon' }, figures: [{ key: 'population', label: 'Usual residents', value: 1500, source: 'Nomis', datasetId: 'NM_test_1', referenceDate: 'Census 2021', attribution: 'OGL', fetchedAt: Date.now() }], fetchedAt: Date.now(), freshness: 'fresh' };

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace(LOCAL_WORKSPACE);
});
afterEach(() => { __setFetch(null); vi.restoreAllMocks(); });

describe('neighbourhoodClient — online + offline fallback', () => {
  it('online: returns fresh data and stores it for offline', async () => {
    __setFetch(async () => ({ ok: true, status: 200, json: async () => SAMPLE }));
    const out = await getArea('RM10 8AA');
    expect(out.offline).toBe(false);
    expect(out.available).toBe(true);
    expect(out.figures[0].value).toBe(1500);
    expect(getStored('RM10 8AA')).toBeTruthy(); // cached in the durable store
  });

  it('offline/error after a prior success: returns the stored copy flagged offline', async () => {
    __setFetch(async () => ({ ok: true, status: 200, json: async () => SAMPLE }));
    await getArea('RM10 8AA'); // prime the cache
    __setFetch(async () => { throw new Error('network down'); });
    const out = await getArea('RM10 8AA');
    expect(out.offline).toBe(true);
    expect(out.available).toBe(true);
    expect(out.figures[0].value).toBe(1500);
    expect(out.stored_fetched_at).toBeTruthy();
  });

  it('offline with nothing stored: honest unavailable (never invented numbers)', async () => {
    __setFetch(async () => { throw new Error('network down'); });
    const out = await getArea('SW1A 1AA');
    expect(out.available).toBe(false);
    expect(out.unavailable).toBe(true);
    expect(out.figures).toBeUndefined();
  });

  it('a non-OK response falls back to stored (not treated as data)', async () => {
    __setFetch(async () => ({ ok: true, status: 200, json: async () => SAMPLE }));
    await getArea('RM10 8AA');
    __setFetch(async () => ({ ok: false, status: 502, json: async () => ({ message: 'upstream down' }) }));
    const out = await getArea('RM10 8AA');
    expect(out.offline).toBe(true);
    expect(out.available).toBe(true);
  });
});
