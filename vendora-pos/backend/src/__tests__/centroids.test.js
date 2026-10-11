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

describe('centroids — BNG easting/northing → WGS84 conversion (ONS PWC files)', () => {
  test('osgbToWgs84 converts BNG to WGS84 (verified vs an independent landmark)', () => {
    // Charing Cross, E 530000 / N 180000 → ~51.504°N, -0.128°E (WGS84).
    const cc = centroids.osgbToWgs84(530000, 180000);
    expect(cc.lat).toBeCloseTo(51.5040, 3);
    expect(cc.lng).toBeCloseTo(-0.1283, 3);
    // OS benchmark point E 651409.903 / N 313177.270 → WGS84 (post-Helmert, not the OSGB36 worked-example value).
    const os = centroids.osgbToWgs84(651409.903, 313177.270);
    expect(os.lat).toBeCloseTo(52.65798, 4);
    expect(os.lng).toBeCloseTo(1.71605, 4);
  });

  test('parseLatLng converts a BNG x/y row, and passes lat/long rows through', () => {
    // BNG (big numbers) → converted:
    const bng = centroids.parseLatLng({ OA21CD: 'E00000001', x: '651409.903', y: '313177.270' });
    expect(bng.oa).toBe('E00000001');
    expect(bng.lat).toBeCloseTo(52.65798, 3);
    expect(bng.lng).toBeCloseTo(1.71605, 3);
    // Explicit lat/long → used as-is (lsoa is null when the row has no LSOA column — optional, for the B2/IMD radius):
    const ll = centroids.parseLatLng({ OA21CD: 'E00000002', lat: '51.5', long: '-0.1' });
    expect(ll).toEqual({ oa: 'E00000002', lat: 51.5, lng: -0.1, lsoa: null });
    // Small x/y treated as lng/lat:
    const sm = centroids.parseLatLng({ oa: 'E00000003', x: '-0.12', y: '51.51' });
    expect(sm).toEqual({ oa: 'E00000003', lat: 51.51, lng: -0.12, lsoa: null });
    // An LSOA column is carried through when present (enables the radius deprivation average):
    const withLsoa = centroids.parseLatLng({ OA21CD: 'E00000004', lat: '51.5', long: '-0.1', LSOA21CD: 'E01000001' });
    expect(withLsoa).toEqual({ oa: 'E00000004', lat: 51.5, lng: -0.1, lsoa: 'E01000001' });
    // No usable coords → null:
    expect(centroids.parseLatLng({ x: '1', y: '2' })).toBeNull();
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
