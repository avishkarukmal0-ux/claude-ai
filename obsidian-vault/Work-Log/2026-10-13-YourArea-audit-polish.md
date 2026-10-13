# 2026-10-13 — Your area: audit polish (debug line, offline empty-state, Refresh 44px, /radius timing log)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Domains-Index]] — Neighbourhood Insights ("Your area" card), PWA update banner
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Audit of `index-sb427x4x.js` / SW v40 passed the offline panel, tile cache, map label, Scotland and testUnlock-removal. Four follow-ups: (1) the owner/manager debug line was still visible in production; (2) offline with a saved catchment showed a misleading "use the slider" message (slider is disabled) and offline with NOTHING saved showed nothing — should say "Needs a connection"; (3) the update banner's Refresh button was 76×28, needs 44px; (4) capture a slow `/radius` line (SW1A 1AA still timed out once: 32s then 4.4s; M1 1AE 4.7s). INSIGHTS_TEST_UNLOCK stays Avishka's decision.

## Changes
- `frontend/src/components/insights/RadiusFigures.jsx` — the `radius: ok (200) · … OA w/ data · sample E…` diagnostic is now gated behind `DEBUG_DIAG = import.meta.env.DEV`, so Vite folds it out of the production build. DEV/tests still show it.
- `frontend/src/components/insights/NeighbourhoodAreaCard.jsx` — catchment section now always renders when there's a point, and branches: **offline + nothing saved** → a `role="status"` "Needs a connection to work out your catchment — we'll show it here once you're back online."; **offline + saved** → the read-only saved figures as before (unchanged). The map fallback panel no longer says "Use the slider to set your radius" when the slider is disabled (offline) — it just says "Map needs a connection."
- `frontend/src/pwa.js` — the SW-update toast's **Refresh** button is now `min-h-[44px]` with `px-4` + `inline-flex items-center` (was `px-3 py-1` ≈ 76×28).
- `backend/src/routes/pwaNeighbourhoodRoutes.js` — `/radius` now logs ONE structured line per request (winston, JSON in prod): `durationMs`, `radiusM`, `full`, `configured`, `supported`, `outputAreas`, `oaCount`, `oasWithPopulation`, `slow`. WARN at ≥ `RADIUS_SLOW_MS` (8s), INFO otherwise. The postcode is NOT logged — a short non-reversible `pc` tag (sha1 slice) correlates lines for the same postcode without exposing it.
- `frontend/public/sw.js` — CACHE_VERSION `v40 → v41`.

## Decisions
- **`import.meta.env.DEV`** for the debug line (not a runtime flag) so it's compiled out entirely in production — zero risk of it leaking, and no env var to set on Vercel.
- **Log a hashed postcode tag, never the postcode** — honours the standing "postcode out of URLs and logs" rule while still letting us group a slow postcode's attempts (e.g. the 32s cold hit vs the 4.4s warm retry) in the Render logs.
- **8s WARN threshold** — well below the client's 30s abort, high enough that a normal warm aggregation stays at INFO. The diag counts (oaCount vs oasWithPopulation) in the line tell Nomis rate-limiting/latency apart from a dataset/centroid gap.

## Gotchas
- The catchment section gate changed from `(!catchmentReadOnly || offlineRadiusRec)` to always-on-with-point, with the empty state handled inside a fragment — the online/live and read-only-with-saved paths are unchanged; only the offline-with-nothing-saved case is new.
- I CANNOT fetch Render logs from this container (egress to the Render API/host is blocked), so I can't paste the slow line myself. The new structured log is what makes the next slow `/radius` easy to grab from the Render dashboard → Logs (filter `"pwa-neighbourhood /radius"` and `"slow":true`).

## Verification
- Backend insights: **19 passed**; route loads (`node -e require(...)`).
- Frontend: **544 passed** (80 files); `npm run build` green (new bundle `index-BPUurZSo.js`).
- Could NOT verify live (Render egress blocked). **Backend change → needs a manual Render deploy** for the `/radius` log line to appear.

## Commit(s)
- `<hash>` — fix(neighbourhood): hide debug line in prod, offline empty-state, 44px Refresh, /radius timing log

## Follow-ups
- [ ] Deploy backend to Render, then reproduce SW1A 1AA; grab the WARN `pwa-neighbourhood /radius` line (durationMs + oaCount/oasWithPopulation) so we can classify the stall.
- [ ] INSIGHTS_TEST_UNLOCK on/off in prod — Avishka's call.
