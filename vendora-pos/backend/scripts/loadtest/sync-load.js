/* eslint-disable */
// k6 load test for the PWA cross-device sync path (/api/pwa-sync) — scale readiness for ~100 shops × 5–7
// devices (~500–700 virtual devices). Simulates SHOPS shops, each with DEVICES_PER_SHOP devices running a
// realistic poll/push cycle: a delta PULL every iteration (sending known revs + If-None-Match, so most are
// a tiny 304) and an occasional PUSH (a staff edit to inventory). Each shop shares ONE token, so the
// per-shop rate-limit bucket is exercised exactly as in production.
//
// ⚠️ STAGING ONLY. This registers accounts and writes sync blobs. Point BASE_URL at a staging deployment,
// never production — the init guard below refuses the known production host.
//
// Run:
//   k6 run -e STAGING=1 -e BASE_URL=https://vendora-staging.onrender.com src/../scripts/loadtest/sync-load.js
//   # tune: -e SHOPS=140 -e DEVICES_PER_SHOP=5 -e DURATION=3m
//
// Target (acceptance): 700 virtual devices, p95 < 500ms, http_req_failed ~0, zero 429s for this normal-use
// cadence. (The per-shop sync limit is 300 req/min; this cadence stays well under it.)

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';

// ── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = (__ENV.BASE_URL || '').replace(/\/+$/, '');
const SHOPS = parseInt(__ENV.SHOPS || '140', 10);
const DEVICES_PER_SHOP = parseInt(__ENV.DEVICES_PER_SHOP || '5', 10);
const VUS = SHOPS * DEVICES_PER_SHOP;            // 140 × 5 = 700
const DURATION = __ENV.DURATION || '3m';
const ITEMS = parseInt(__ENV.ITEMS || '200', 10); // inventory items per shop (payload size realism)
const PUSH_PROB = parseFloat(__ENV.PUSH_PROB || '0.2'); // ~1 in 5 iterations is an edit
const RUN = `lt${Date.now()}`;

// Refuse to point this at production, whatever the operator typed. Two gates:
//  (1) an explicit opt-in: -e STAGING=1 (so a bare BASE_URL can never accidentally run);
//  (2) a production-host denylist — the Render API host, and the custom production domain(s) once they exist
//      (add them to PROD_DENY below before go-live so this keeps refusing them).
const PROD_DENY = [
  'vendora-api-5pyt.onrender.com',
  // 'api.vendora.co.uk',   // ← add the custom production domain here once it's live
  // 'vendora.co.uk',
];
if (String(__ENV.STAGING || '') !== '1') {
  throw new Error('Refusing to run without -e STAGING=1. This writes accounts/blobs — point BASE_URL at STAGING and pass STAGING=1 to confirm.');
}
if (!BASE_URL) throw new Error('Set BASE_URL to your STAGING backend, e.g. -e BASE_URL=https://vendora-staging.onrender.com');
if (PROD_DENY.some((h) => h && BASE_URL.toLowerCase().includes(h))) {
  throw new Error(`Refusing to load-test a production host (${BASE_URL}). Point BASE_URL at STAGING.`);
}

const rate429 = new Counter('sync_429s'); // must stay 0 for normal-use acceptance

export const options = {
  scenarios: {
    devices: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: VUS }, // ramp up
        { duration: DURATION, target: VUS }, // hold at full device count
        { duration: '15s', target: 0 }, // ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    sync_429s: ['count<1'], // zero 429s for normal use
    checks: ['rate>0.99'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeInventory(n) {
  const items = [];
  for (let i = 0; i < n; i += 1) {
    items.push({ id: `p${i}`, name: `Product ${i}`, barcode: `50000${String(i).padStart(7, '0')}`, qty: (i % 50), price: 1 + (i % 400) / 100, cost: 0.5 + (i % 300) / 100, category: `Cat ${i % 12}`, updatedAt: Date.now() });
  }
  return JSON.stringify(items);
}
function track429(res) { if (res && res.status === 429) rate429.add(1); }

// ── Setup: register SHOPS shops, seed each with an inventory blob so pulls transfer realistic data ──────
export function setup() {
  const shops = [];
  for (let i = 0; i < SHOPS; i += 1) {
    const email = `loadtest+${RUN}_${i}@example.com`;
    const reg = http.post(`${BASE_URL}/api/pwa-auth/register`, JSON.stringify({ email, password: 'loadtest-pw-123', shopName: `LoadShop ${i}` }), { headers: { 'Content-Type': 'application/json' }, tags: { name: 'register' } });
    if (reg.status !== 200 && reg.status !== 201) { continue; }
    const token = reg.json('token');
    const shopId = reg.json('shop.id');
    if (!token) continue;
    // Seed one inventory blob at rev 1 so devices have something to pull and delta/304 can engage.
    http.post(`${BASE_URL}/api/pwa-sync/push`, JSON.stringify({ changes: [{ name: 'inventory_v1', value: makeInventory(ITEMS), baseRev: 0, mtime: Date.now() }] }), { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, tags: { name: 'seed' } });
    shops.push({ token, shopId });
  }
  if (!shops.length) throw new Error('Setup registered no shops — check BASE_URL and that /api/pwa-auth/register works on staging.');
  return { shops };
}

export const options_setupTimeout = '180s'; // (informational; set via --setup-timeout if your k6 needs it)

// Per-VU state (k6 gives each VU its own module instance) — remembers revs + the last ETag across iterations
// so the delta pull + If-None-Match behave exactly like a real device catching up.
let knownRevs = {};
let etag = null;

export default function (data) {
  const shop = data.shops[(__VU - 1) % data.shops.length];
  if (!shop) { sleep(1); return; }
  const authHeaders = { Authorization: `Bearer ${shop.token}`, 'Content-Type': 'application/json' };

  // 1) DELTA PULL — send known revs + If-None-Match. Most idle polls come back 304 (tiny).
  const names = Object.keys(knownRevs);
  const q = names.length ? `?revs=${names.map((n) => `${n}:${knownRevs[n]}`).join(',')}` : '';
  const pullHeaders = etag ? { ...authHeaders, 'If-None-Match': etag } : authHeaders;
  const pull = http.get(`${BASE_URL}/api/pwa-sync/pull${q}`, { headers: pullHeaders, tags: { name: 'pull' } });
  track429(pull);
  check(pull, { 'pull 200/304': (r) => r.status === 200 || r.status === 304 });
  if (pull.status === 200) {
    const blobs = pull.json('blobs') || [];
    for (const b of blobs) knownRevs[b.name] = b.rev;
    etag = pull.headers.ETag || pull.headers.Etag || etag;
  } else if (pull.status === 304) {
    etag = pull.headers.ETag || pull.headers.Etag || etag;
  }

  // 2) Occasional PUSH — a staff edit to inventory (concurrent across the shop's devices → exercises LWW).
  if (Math.random() < PUSH_PROB) {
    const baseRev = knownRevs.inventory_v1 || 0;
    const push = http.post(`${BASE_URL}/api/pwa-sync/push`, JSON.stringify({ changes: [{ name: 'inventory_v1', value: makeInventory(ITEMS), baseRev, mtime: Date.now() }] }), { headers: authHeaders, tags: { name: 'push' } });
    track429(push);
    check(push, { 'push 200': (r) => r.status === 200 });
    if (push.status === 200) {
      for (const a of (push.json('applied') || [])) knownRevs[a.name] = a.rev;
      etag = null; // our write changed the server ETag; next pull will re-sync it
    }
  }

  // Keep the per-shop request rate well under the 300/min sync cap (5 devices × ~27/min ≈ 135/min).
  sleep(1.5 + Math.random() * 1.5); // 1.5–3s between cycles
}

// ── Teardown note ───────────────────────────────────────────────────────────
// This test leaves loadtest+<run>@example.com accounts and their blobs on staging. Clean them up with a
// staging-only script (match email /^loadtest\+/). Never run cleanup against production.
export function teardown() { /* intentionally no destructive cleanup from the load runner */ }
