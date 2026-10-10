# 2026-10-10 (part 7) — Neighbourhood Insights: OA centroids in MongoDB (radius figures on Render)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Deployment-Config]] · Neighbourhood Insights (PAID)
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Make the paid radius figures actually work on Render. The centroid-in-radius engine needs the ONS OA
population-weighted centroids (~190k rows), which were loaded from a FILE — but Render's free tier has an
ephemeral filesystem, so a file doesn't persist. Store the centroids in MongoDB instead (same durable pattern as
the IMD import), and give the owner a way to check they're loaded.

## Changes
- `models/OaCentroid.js` (new): `{ oa (unique), lat, lng }` — one row per 2021 Output Area (E&W), OGL v3.0.
- `services/insightsData/centroids.js`: `load()` now prefers a configured file (`INSIGHTS_CENTROIDS_PATH`,
  back-compat) and otherwise **loads from MongoDB** into memory (cached once). Added `count()`
  (`estimatedDocumentCount`, for a cheap status check without loading all rows) and a `dbReady()` guard so it
  never hangs/throws without a DB connection (returns an honest "not loaded"). `status()` reports the source
  (`file`/`mongo`) + count. The engine (`nomis.fetchAreaProfiles` → `centroids.all()`) is unchanged.
- `scripts/import-centroids.js` (new): idempotent bulk-upsert import from the ONS OA 2021 PWC CSV/NDJSON (by OA
  code), mirroring `import-imd.js` (incl. the `NODE_OPTIONS=--require ./scripts/dns-8888.js` SRV workaround note).
- `services/insightsService.js`: `dataStatus()` → `{ provider, centroids: {source,count,loaded}, ready }`
  (ready = provider set + centroids present). Surfaced in `GET /api/pwa-insights/status` as `data`, so the owner
  can verify radius-figure readiness without a profile call.

## Notes / decisions
- **Why Mongo not a file:** Render free has no persistent disk; IMD already uses Mongo, so centroids follow the
  same owner-run import. A multi-MB file committed to the repo was rejected as the alternative.
- Centroids are loaded into memory once per process (~190k × {oa,lat,lng}); the first radius request after a cold
  start pays that one-time cost, then it's cached (on top of the existing per-profile TTL cache).
- No fabricated numbers: with no provider or no centroids, `/profile` still returns `configured:false`.
- No frontend change needed — the paid Insights view already re-sums figures as the radius moves; it just needs
  the data present + entitlement.

## Verification
- BE: `insightsService` + `insightsGeo` + `insightsData` 33/33; new `centroids` guards 4/4; app loads.
- **Not run (owner/DB):** the real Mongo import + a live radius `/profile` — needs the CSV + Atlas + entitlement;
  sandbox has no DB/egress.

## Owner steps to turn ON paid radius figures
1. Download the ONS "Output Areas (Dec 2021) PWC (V3)" centroids CSV (lat/long), ~190k rows.
2. Import to Mongo (test DB first): `node scripts/import-centroids.js "<path>"` (set `MONGODB_URI`; use the
   `dns-8888.js` shim if SRV is blocked). Expect ~188,880 centroids. Repeat for `vendora_pilot`.
3. Render env: `INSIGHTS_ENABLED=true`, `INSIGHTS_DATA_PROVIDER=nomis` (leave `INSIGHTS_CENTROIDS_PATH` UNSET so
   it reads from Mongo). Redeploy.
4. Check `GET /api/pwa-insights/status` → `data.ready: true` and `data.centroids.count` > 0.
5. An entitled shop → Neighbourhood Insights screen → the figures re-sum as the radius changes.

## Commit(s)
- `feat(insights): load OA centroids from MongoDB (+ import script + status) for radius figures on Render`

## Follow-ups
- [ ] Optional: surface `status.data.ready`/centroid count in the Insights UI so the owner sees "radius figures
      not configured yet" explicitly (currently honest via `/profile` configured:false).
