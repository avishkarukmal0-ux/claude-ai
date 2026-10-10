'use strict';

// Map-tile proxy for the Neighbourhood Insights radius view. The browser requests tiles from OUR backend
// (/api/pwa-insights/tiles/:z/:x/:y.png) and this module fetches them from the configured tile host server-side,
// setting a proper User-Agent (OSM usage policy) and a cache header. Proxying keeps the browser from calling the
// tile host directly, so neither CSP (frontend vercel.json / backend helmet) needs widening. Tiles are public
// OpenStreetMap raster tiles — not the paid census data — but the route still sits behind the owner/manager gate.
const config = require('../config');

const T = () => config.neighbourhoodInsights.tiles;

/** Valid slippy-map tile coordinate? z in [0,maxZoom]; x,y integers in [0, 2^z). Pure — guards the proxy against
 *  arbitrary upstream URLs and absurd coordinates before any network call. */
function isValidTile(z, x, y) {
  const Z = Number(z); const X = Number(x); const Y = Number(y);
  if (![Z, X, Y].every((n) => Number.isInteger(n))) return false;
  if (Z < 0 || Z > (T().maxZoom || 19)) return false;
  const max = 2 ** Z;
  return X >= 0 && X < max && Y >= 0 && Y < max;
}

/** Build the upstream tile URL from the configured template. */
function tileUrl(z, x, y) {
  return T().urlTemplate.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

// Pluggable transport for tests (so we never hit the real tile host in CI).
async function defaultTransport(url, { headers } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), T().timeoutMs || 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, contentType: res.headers.get('content-type') || 'image/png', body: buf };
  } finally { clearTimeout(timer); }
}
let _transport = defaultTransport;
function __setTransport(t) { _transport = t || defaultTransport; }

/** Fetch one tile. Returns { status, contentType, body(Buffer) }. Throws on an invalid coordinate. */
async function fetchTile(z, x, y) {
  if (!isValidTile(z, x, y)) { const e = new Error('Invalid tile coordinate.'); e.statusCode = 400; throw e; }
  return _transport(tileUrl(z, x, y), { headers: { 'User-Agent': T().userAgent } });
}

module.exports = { isValidTile, tileUrl, fetchTile, __setTransport };
