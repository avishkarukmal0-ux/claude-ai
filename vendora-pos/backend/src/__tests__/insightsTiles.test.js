'use strict';

// Map-tile proxy — coordinate validation (pure, no network) + fetchTile via a stubbed transport (FIXTURE, never
// the real tile host). Guards the proxy from being driven to arbitrary upstream URLs or absurd coordinates.
process.env.INSIGHTS_ENABLED = 'true';
const tiles = require('../services/insightsTiles');

afterEach(() => tiles.__setTransport(null));

describe('insightsTiles.isValidTile', () => {
  test('accepts valid slippy-map coordinates', () => {
    expect(tiles.isValidTile(0, 0, 0)).toBe(true);
    expect(tiles.isValidTile(1, 1, 1)).toBe(true);
    expect(tiles.isValidTile(16, 32767, 21845)).toBe(true); // within 2^16
    expect(tiles.isValidTile(19, 0, 0)).toBe(true);
  });

  test('rejects out-of-range zoom and x/y beyond 2^z, and non-integers', () => {
    expect(tiles.isValidTile(-1, 0, 0)).toBe(false);
    expect(tiles.isValidTile(20, 0, 0)).toBe(false);      // > maxZoom (19)
    expect(tiles.isValidTile(1, 2, 0)).toBe(false);       // x must be < 2^1 = 2
    expect(tiles.isValidTile(1, 0, 2)).toBe(false);       // y must be < 2
    expect(tiles.isValidTile(2, 1.5, 1)).toBe(false);     // non-integer
    expect(tiles.isValidTile('x', 0, 0)).toBe(false);     // NaN
  });
});

describe('insightsTiles.tileUrl + fetchTile', () => {
  test('builds the upstream URL from the template', () => {
    expect(tiles.tileUrl(5, 15, 10)).toBe('https://tile.openstreetmap.org/5/15/10.png');
  });

  test('fetchTile passes a User-Agent and returns the upstream body/content-type', async () => {
    let seenUrl = null; let seenUA = null;
    tiles.__setTransport(async (url, { headers }) => {
      seenUrl = url; seenUA = headers['User-Agent'];
      return { status: 200, contentType: 'image/png', body: Buffer.from([0x89, 0x50]) };
    });
    const out = await tiles.fetchTile(5, 15, 10);
    expect(seenUrl).toBe('https://tile.openstreetmap.org/5/15/10.png');
    expect(typeof seenUA).toBe('string');
    expect(seenUA.length).toBeGreaterThan(0);
    expect(out.status).toBe(200);
    expect(out.body.length).toBe(2);
  });

  test('fetchTile throws on an invalid coordinate before any network call', async () => {
    let called = false;
    tiles.__setTransport(async () => { called = true; return { status: 200, body: Buffer.alloc(0) }; });
    await expect(tiles.fetchTile(1, 9, 0)).rejects.toThrow(/invalid tile/i);
    expect(called).toBe(false);
  });
});
