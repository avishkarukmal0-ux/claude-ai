'use strict';

// OA centroid loader — the DB-free guards (so it never hangs without a Mongo connection) and the test seam.
// The real Mongo load is covered by the owner's import + a DB-gated integration run; here we only assert the
// honest "not loaded" behaviour and the in-memory injection used by the geo/data tests.
delete process.env.INSIGHTS_CENTROIDS_PATH; // force the Mongo code path (no file configured)
const centroids = require('../services/insightsData/centroids');

afterEach(() => centroids.__setForTest(null));

describe('centroids loader — no file, no DB connection', () => {
  test('load() returns a clear not-loaded result instead of hanging/throwing', async () => {
    const r = await centroids.load({ force: true });
    expect(r.loaded).toBe(false);
    expect(r.count).toBe(0);
    expect(String(r.reason)).toMatch(/database not connected|Mongo/i);
    expect(centroids.isLoaded()).toBe(false);
    expect(centroids.all()).toEqual([]);
  });

  test('count() returns null (unknown) when there is no DB and no file', async () => {
    expect(await centroids.count()).toBeNull();
  });

  test('status() reports the mongo source when no file is configured', () => {
    const s = centroids.status();
    expect(s.source).toBe('mongo');
    expect(s.loaded).toBe(false);
  });
});

describe('centroids test seam', () => {
  test('__setForTest injects centroids in memory (used by the geo/data tests)', () => {
    centroids.__setForTest([{ oa: 'E00000001', lat: 51.5, lng: -0.1 }, { oa: 'E00000002', lat: 51.51, lng: -0.09 }]);
    expect(centroids.isLoaded()).toBe(true);
    expect(centroids.all()).toHaveLength(2);
    expect(centroids.status()).toMatchObject({ loaded: true, count: 2, source: 'test' });
  });
});
