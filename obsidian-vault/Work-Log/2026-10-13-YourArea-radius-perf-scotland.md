# 2026-10-13 — Your area: radius perf + Scotland render + testUnlock + don't-cache-unsupported

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Buying]] · [[Services]] · [[API-Routes]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Context
The Scotland "shows NOTHING" + clear + offline-label fixes shipped in `7b26068` (bundle was pre-that build).
This round adds the genuinely-new items and makes the Scotland path robust.

## Changes
1. **Radius intermittent >30s (dense postcodes)** — `nomis.fetchTable` fetched its OA batches (up to ~14 at
   150 OAs each, maxOutputAreas 2000) **sequentially**; now **parallel with bounded concurrency (6)** via a new
   `mapLimit`. Plus `insightsService.buildProfile` gets **in-flight coalescing** (`_inflight`): a Retry during a
   still-running slow first request shares that one computation instead of starting a second. (Result cache from
   the prior commit already makes repeats/Retry-after-completion instant.)
2. **Scotland/NI** — card already renders the `reason` in a `role="status"` region (7b26068). Now also: the
   **Slider/Map + radius fetch are hidden** for an unsupported postcode (`point` gated on `ok && available`), and
   the client **does not cache** a `available:false` response as figures (`putStored` only when `available===true`).
3. **`testUnlock` leak** — removed `testUnlock:true` from the `/radius` response body (internal gate, not client
   data; the `INSIGHTS_TEST_UNLOCK` server gate is unchanged — turn that env var off if radius should be paid-only).

## Files
- `backend/src/services/insightsData/nomis.js` (mapLimit + parallel batches)
- `backend/src/services/insightsService.js` (in-flight coalescing)
- `backend/src/routes/pwaNeighbourhoodRoutes.js` (drop testUnlock)
- `backend/src/__tests__/insightsService.test.js` (coalescing test)
- `frontend/src/lib/neighbourhoodClient.js` (cache only real figures)
- `frontend/src/components/insights/NeighbourhoodAreaCard.jsx` (gate point)
- `public/sw.js` v37→v38

## Verification
- backend insights **19** pass (+ coalescing); app loads. FE **539** + build green.
- **Backend parts need the manual Render deploy** (nomis parallel, coalesce, testUnlock drop).
- **Could not profile live** (Render egress blocked). The parallel batches should cut dense-postcode wall-clock
  from (num_batches × latency) to ~(ceil(num_batches/6) × latency); the 30s client timeout + Retry stay.

## Commit(s)
- `<hash>` — SW v37→v38.

## Follow-ups
- [ ] If a NEW postcode's /radius still exceeds 30s after deploy, capture the slow Render log line — that would
      point to Nomis rate-limiting (lower FETCH_CONCURRENCY) or a specific dataset, vs raw latency.
- [ ] Decide whether radius should stay free in production (INSIGHTS_TEST_UNLOCK on) or be paid-gated.
