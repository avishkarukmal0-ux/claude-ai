import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getArea, getStored, getRadiusProfile, __setFetch } from '../neighbourhoodClient';
import { setActiveWorkspace, LOCAL_WORKSPACE, __resetMemForTest } from '../storage';

// FIXTURE (test-only): a mocked backend response. No sample/mock data exists in any production path.
const SAMPLE = { success: true, available: true, postcode: 'RM108AA', area: { ward: 'Alibon' }, figures: [{ key: 'population', label: 'Usual residents', value: 1500, source: 'Nomis', datasetId: 'NM_test_1', referenceDate: 'Census 2021', attribution: 'OGL', fetchedAt: Date.now() }], fetchedAt: Date.now(), freshness: 'fresh' };

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace(LOCAL_WORKSPACE);
});
afterEach(() => { __setFetch(null); vi.restoreAllMocks(); });

describe('neighbourhoodClient.getRadiusProfile — radius aggregation request', () => {
  it('POSTs /radius with the postcode in the body (not the URL) and returns the parsed body', async () => {
    let seenUrl = null; let seenOpts = null;
    __setFetch(async (url, opts) => { seenUrl = url; seenOpts = opts; return { ok: true, status: 200, json: async () => ({ success: true, configured: true, profile: { population: 1000, households: 400, outputAreas: 5 } }) }; });
    const out = await getRadiusProfile({ postcode: 'RM10 8AA', radiusM: 1609.3 });
    expect(seenUrl).toBe('/api/pwa-neighbourhood/radius'); // no query string
    expect(seenOpts.method).toBe('POST');
    expect(JSON.parse(seenOpts.body)).toEqual({ postcode: 'RM108AA', radiusM: 1609, full: false });
    expect(out.configured).toBe(true);
    expect(out.profile.population).toBe(1000);
  });

  it('throws with .status on a non-ok response (e.g. 403 locked)', async () => {
    __setFetch(async () => ({ ok: false, status: 403, json: async () => ({ message: 'paid add-on' }) }));
    await expect(getRadiusProfile({ postcode: 'RM10 8AA', radiusM: 1000 })).rejects.toMatchObject({ status: 403 });
  });

  it('falls back to GET /radius when POST 404s (deploy mismatch)', async () => {
    const methods = [];
    __setFetch(async (url, opts) => {
      methods.push((opts && opts.method) || 'GET');
      if (!opts || opts.method !== 'POST') return { ok: true, status: 200, json: async () => ({ success: true, configured: true, profile: { population: 5 } }) };
      return { ok: false, status: 404, json: async () => { throw new Error('html'); } };
    });
    const out = await getRadiusProfile({ postcode: 'RM10 8AA', radiusM: 1000 });
    expect(out.configured).toBe(true);
    expect(methods).toContain('POST');
    expect(methods).toContain('GET');
  });

  it('aborts when the caller signal fires (supersede / unmount)', async () => {
    const ac = new AbortController();
    __setFetch((url, opts) => new Promise((_, reject) => {
      opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const p = getRadiusProfile({ postcode: 'RM10 8AA', radiusM: 1000, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('neighbourhoodClient — online + offline fallback', () => {
  it('online: returns fresh data and stores it for offline', async () => {
    __setFetch(async () => ({ ok: true, status: 200, json: async () => SAMPLE }));
    const out = await getArea('RM10 8AA');
    expect(out.offline).toBe(false);
    expect(out.available).toBe(true);
    expect(out.figures[0].value).toBe(1500);
    expect(getStored('RM10 8AA')).toBeTruthy(); // cached in the durable store
  });

  it('clearStored removes the saved copy for a postcode (space/case-insensitive)', async () => {
    const { clearStored } = await import('../neighbourhoodClient');
    __setFetch(async () => ({ ok: true, status: 200, json: async () => SAMPLE }));
    await getArea('RM10 8AA');
    expect(getStored('RM10 8AA')).toBeTruthy();
    clearStored('rm108aa');
    expect(getStored('RM10 8AA')).toBeNull();
  });

  it('sends the postcode in the POST body, never in the URL (keeps it out of logs/history)', async () => {
    let seenUrl = null; let seenOpts = null;
    __setFetch(async (url, opts) => { seenUrl = url; seenOpts = opts; return { ok: true, status: 200, json: async () => SAMPLE }; });
    await getArea('RM10 8AA', { force: true });
    expect(seenUrl).toBe('/api/pwa-neighbourhood/area');  // no query string
    expect(seenUrl).not.toMatch(/postcode=/);
    expect(seenOpts.method).toBe('POST');
    expect(seenOpts.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(seenOpts.body)).toEqual({ postcode: 'RM108AA', force: true });
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

  it('network error with nothing stored: typed network failure (never invented numbers)', async () => {
    __setFetch(async () => { throw new Error('network down'); });
    const out = await getArea('RM10 8AA');
    expect(out.ok).toBe(false);
    expect(out.kind).toBe('network');
    expect(out.figures).toBeUndefined();
  });

  it('a 5xx response falls back to stored (not treated as data)', async () => {
    __setFetch(async () => ({ ok: true, status: 200, json: async () => SAMPLE }));
    await getArea('RM10 8AA');
    __setFetch(async () => ({ ok: false, status: 502, json: async () => ({ message: 'upstream down' }) }));
    const out = await getArea('RM10 8AA');
    expect(out.offline).toBe(true);
    expect(out.ok).toBe(true);
    expect(out.available).toBe(true);
  });

  it('maps status codes to distinct typed outcomes', async () => {
    __setFetch(async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid' }) }));
    expect((await getArea('ZZ99 9ZZ')).kind).toBe('invalid');
    __setFetch(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    expect((await getArea('RM10 8AA')).kind).toBe('auth');
    __setFetch(async () => ({ ok: false, status: 404, json: async () => ({ error: 'no_data' }) }));
    expect((await getArea('RM10 8AA')).kind).toBe('no_data');
  });

  it('falls back to GET when POST 404s on an out-of-step server (deploy mismatch)', async () => {
    const calls = [];
    __setFetch(async (url, opts) => {
      calls.push({ url, method: (opts && opts.method) || 'GET' });
      if (!opts || opts.method !== 'POST') return { ok: true, status: 200, json: async () => SAMPLE }; // GET works
      return { ok: false, status: 404, json: async () => { throw new Error('html'); } };                // POST not found
    });
    const out = await getArea('RM10 8AA');
    expect(out.ok).toBe(true);
    expect(out.available).toBe(true);
    expect(calls.some((c) => c.method === 'POST')).toBe(true);          // tried POST first
    expect(calls.some((c) => c.method === 'GET' && /postcode=/.test(c.url))).toBe(true); // then GET fallback
  });
});

describe('isValidUkPostcode', () => {
  it('accepts valid UK formats (space-insensitive) and rejects rubbish', async () => {
    const { isValidUkPostcode } = await import('../neighbourhoodClient');
    expect(isValidUkPostcode('RM10 8AA')).toBe(true);
    expect(isValidUkPostcode('rm108aa')).toBe(true);
    expect(isValidUkPostcode('SW1A 1AA')).toBe(true);
    expect(isValidUkPostcode('M1 1AE')).toBe(true);
    expect(isValidUkPostcode('')).toBe(false);
    expect(isValidUkPostcode('NOPE')).toBe(false);
    expect(isValidUkPostcode('12345')).toBe(false);
  });
});
