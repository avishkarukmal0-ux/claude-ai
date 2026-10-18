'use strict';

// Exercises centroids.loadFromMongo's CURSOR-STREAMING warm path (the cold-start #4 change) WITHOUT a live
// Mongo: mongoose's connection is faked as "connected" and the OaCentroid model is mocked with a query chain
// whose .cursor() is an async generator over rows we control. This covers the row filtering and the
// yield-every-10k branch that the DB-gated path otherwise leaves untested.

// A mutable holder the model mock streams from (jest allows out-of-scope refs prefixed "mock").
const mockState = { rows: [] };

jest.mock('mongoose', () => ({ connection: { readyState: 1 } })); // dbReady() → true
jest.mock('../models/OaCentroid', () => ({
  find() {
    return {
      lean() { return this; },
      batchSize() { return this; },
      cursor() {
        const rows = mockState.rows;
        return (async function* gen() { for (const r of rows) yield r; })();
      },
    };
  },
}));

const centroids = require('../services/insightsData/centroids');

afterEach(() => centroids.__setForTest(null));

describe('centroids.loadFromMongo — streaming warm', () => {
  test('streams rows, filters out invalid ones, and normalises the shape', async () => {
    mockState.rows = [
      { oa: 'E00000001', lat: 51.5, lng: -0.1, lsoa: 'E01000001' },
      { oa: 'E00000002', lat: 51.6, lng: -0.2 },              // no lsoa → null
      { oa: 'BAD', lat: 'nope', lng: -0.3 },                   // non-finite lat → dropped
      { oa: '', lat: 51.7, lng: -0.4 },                        // missing oa → dropped
      null,                                                     // junk → dropped
    ];
    const r = await centroids.load({ force: true });
    expect(r).toMatchObject({ loaded: true, count: 2, source: 'mongo' });
    const all = centroids.all();
    expect(all).toEqual([
      { oa: 'E00000001', lat: 51.5, lng: -0.1, lsoa: 'E01000001' },
      { oa: 'E00000002', lat: 51.6, lng: -0.2, lsoa: null },
    ]);
    expect(centroids.isLoaded()).toBe(true);
    expect(centroids.status().loadMs).toBeGreaterThanOrEqual(0);
  });

  test('handles a large stream (exercises the >10k event-loop yield) and counts them all', async () => {
    const N = 25000; // > 2 × the 10k yield threshold
    mockState.rows = Array.from({ length: N }, (_, i) => ({ oa: `E${i}`, lat: 51 + i * 1e-6, lng: -0.1, lsoa: null }));
    const r = await centroids.load({ force: true });
    expect(r.count).toBe(N);
    expect(centroids.all().length).toBe(N);
  });

  test('empty collection → loaded:false with a helpful reason', async () => {
    mockState.rows = [];
    const r = await centroids.load({ force: true });
    expect(r.loaded).toBe(false);
    expect(r.count).toBe(0);
    expect(r.reason).toMatch(/no centroids imported/i);
  });
});
