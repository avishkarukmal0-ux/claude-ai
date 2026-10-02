# 2026-10-02 — Real neighbourhood data (ONS Beta API / Nomis / postcodes.io), PWA-correct

Back to [[Work-Log]] · [[Home]] · config in [[Deployment-Config]]

**Domain(s):** new — Neighbourhood area data (real, cached, offline-capable). Separate from the paid add-on.
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Step 1 (smallest safe version): ONE real figure (population) for the store's area, end to end, with full
provenance + freshness, cached server-side, working offline in the PWA, no invented numbers. The browser
never calls ONS/Nomis/postcodes.io directly.

## Inspected first (no edits until listed)
- `public/sw.js` — hand-rolled SW; **`/api` is deliberately never cached** (live data); prompt-driven updates,
  no skipWaiting (audit F10); `CACHE_VERSION=vendora-v5`. → Offline for this feature belongs at the APP layer
  (IndexedDB), not the SW. SW left unchanged (no regression risk).
- `src/lib/idb.js` + `storage.js` — durable localStorage+IndexedDB mirror = the app's offline store. Reused.
- `public/manifest.webmanifest` — unchanged.
- existing `insightsService`/`insightsLocation`/`NeighbourhoodInsightsView` — the paid add-on; this is independent.

## Key constraint
**Sandbox egress to postcodes.io / ONS / Nomis is blocked (all unreachable).** So the live end-to-end proof
and the real dataset-id confirmation CANNOT be run here — built + unit-tested offline; live run is an owner step.

## Changes
**Backend**
- `config.neighbourhood` (flags/bases/UA/UID/dataset/TTL/timeout/concurrency; all OFF/blank by default).
- `models/NeighbourhoodArea.js` — per-postcode cache with full provenance (source, datasetId, edition/version,
  referenceDate, dataset last_updated, fetchedAt) + 180-day TTL cap.
- `services/neighbourhoodService.js` — pure helpers (normalise/validate postcode, parseRetryAfter, decideRefresh,
  freshnessOf, shapeResponse) + network layer: postcodes.io resolve, ONS Beta + Nomis population fetch
  (dataset id CONFIGURABLE — never hardcode a guess; returns null → "unavailable" if absent), concurrency
  limiter, 429/Retry-After retry, timeout (55s for Render cold start), MongoDB cache + staleness/refresh, stale
  fallback. OGL attribution on every figure.
- `routes/pwaNeighbourhoodRoutes.js` (mounted only when NEIGHBOURHOOD_ENABLED) — `GET /status`, `GET /area?postcode=`;
  owner/manager; NOT entitlement-gated (it's one free real figure, not the paid add-on).
**Frontend**
- `lib/neighbourhoodClient.js` — calls our backend; caches last response per postcode in the durable store
  (localStorage + IndexedDB mirror); online→fresh, offline/timeout/error→stored copy flagged `offline`, nothing
  stored→honest unavailable. 55s cold-start timeout.
- `components/insights/NeighbourhoodAreaCard.jsx` — figure + source/date/OGL; offline + out-of-date labels;
  cold-start loading note; retry. Rendered in the Insights view's FREE section (visible without entitlement).
- `features.NEIGHBOURHOOD_ENABLED` (default OFF).

## Verification (this environment)
- Backend DB-free `neighbourhood.test.js` (9): helpers, postcode resolve (RM10 8AA), **429→Retry-After→retry**,
  Nomis parse, "no dataset → null (never a guess)". DB-gated `pwaNeighbourhood.integration.test.js` (5: status,
  real figure + provenance, server cache, auth required, invalid postcode) — **skipped here (no Mongo)**.
- Frontend `neighbourhood.test.js` (4): online caches, offline→stored labelled, offline+nothing→unavailable,
  non-OK→stored. Full FE **350 green + build clean**. App loads with the feature on.
- **Not fully verified yet (sandbox egress blocked):** real postcodes.io/ONS/Nomis responses, the real dataset
  id, and the live DevTools-offline run. Owner runs these (commands in [[Deployment-Config]]).

## Remaining / owner steps
- Set `ONS_USER_AGENT`; choose `NEIGHBOURHOOD_SOURCE`; confirm + set `NEIGHBOURHOOD_POP_DATASET` from the live
  catalogue; optional secret `NOMIS_UID`; enable the two flags; redeploy backend (Render) + frontend (Vercel).
- A scheduled refresh is NOT added (free Render sleeps) — refresh is on-demand/staleness. A cron could be
  proposed separately (cost first).

## Rollback
Feature is additive + OFF by default. Rollback = unset `NEIGHBOURHOOD_ENABLED` / `VITE_NEIGHBOURHOOD_ENABLED`
(or revert these commits). No existing route/model/SW changed; auth, Brevo and the accounts flag untouched.

## Commit(s)
- (this session) config+model+service · route+mount · frontend client+card+flag · tests+.env.example+docs.
