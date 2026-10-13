# 2026-10-13 — Your area: offline map fallback + tile cache

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Domains-Index]] — Neighbourhood Insights ("Your area" free card)
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
The catchment map tiles come from `/api/pwa-neighbourhood/tiles/...`, which the service worker never caches (SW skips `/api`, and there is no tile store in IndexedDB). So when the card was loaded online and the connection then dropped (`navigator.onLine` false, or tiles 404), the base map drew blank — a grey grid with no explanation. Fix it, smallest first, without touching the figures (which already come from the saved copy).

## Changes
- `frontend/src/lib/neighbourhoodClient.js` — `fetchTileObjectURL` now caches each fetched tile in a **page-owned Cache API** store (`vendora-tiles-v1`, cap 50, 7-day TTL, LRU by insertion order) and, on a network failure, serves the tile from that cache so the **last-viewed area still draws offline**. Fully guarded: no Cache API (old browsers / tests) → network-only, never an error. Not in the SW because the SW deliberately never touches `/api`.
- `frontend/public/sw.js` — CACHE_VERSION `v38 → v39`; added `KEEP_PREFIXES = ['vendora-tiles']` and exempted it from the activate-time version purge, so bumping the app version no longer wipes the page's tile cache.
- `frontend/src/components/insights/RadiusMap.jsx` — `AuthTileLayer` now reports an `onTileError` up when a tile can be neither fetched nor served from cache; `role="img"` + a dynamic `ariaLabel` prop on the map container (default unchanged).
- `frontend/src/components/insights/NeighbourhoodAreaCard.jsx` — track connectivity (`online` from `navigator.onLine` + `online`/`offline` events) and tile health (`tilesFailed`, reset when back online). `mapUsable = online && !tilesFailed`. When not usable: **hide the map**, show a slider-only fallback (`"Map needs a connection. Use the slider to set your radius."`), force **Slider** mode and hide the "Map zoom" toggle (omit `setMode`). The map region's aria-label now reads `"Map of your area, radius X mi"` (current unit). Figures path untouched.
- Tests: `frontend/src/lib/__tests__/neighbourhood.test.js` — new block for `fetchTileObjectURL`: a fetched tile is cached and still served when the network later fails; throws when neither reachable nor cached (fake in-memory Cache API + stubbed `URL.createObjectURL`).

## Decisions
- **Page-owned Cache API, not the SW.** The SW's contract is "never cache `/api`" (live data + realtime). Map tiles are static imagery but share the `/api` prefix (authed proxy), so caching them belongs in the page, scoped to the one feature that needs it — not a hole in the SW's `/api` rule.
- **Hide the map rather than show a broken one.** A blank grey grid reads as a bug; a slider with a one-line reason keeps the control usable and honest. Slider mode is forced so the radius is still settable offline.
- **Exempt the tile cache from the version purge** (`KEEP_PREFIXES`) so the offline area survives app updates — otherwise every deploy would blank the offline map until the user went online again.
- Scoped the tile cache to `neighbourhoodClient` (the free "Your area" card) only; `insightsClient` (paid add-on) left unchanged.

## Gotchas
- The map `<section>` is already hidden when `result.offline` is true (a served saved copy). The blank-map case is the *other* path: figures loaded online, connection drops later, so `result.offline` stays false and the section shows — that's where `mapUsable` now swaps map→slider.
- Same `Blob` is safely reused for both `URL.createObjectURL(blob)` and `new Response(blob)` (Blobs are re-readable); the cache write is fire-and-forget so it never delays the tile draw.
- `caches` is undefined in jsdom — all cache helpers guard `typeof caches === 'undefined'`; the new tests stub a minimal in-memory Cache API and `URL.createObjectURL`.

## Verification
- `npx vitest run src/lib/__tests__/neighbourhood.test.js` → 15 passed.
- Full FE suite: **541 passed** (80 files). The `HTMLCanvasElement.getContext` log is pre-existing noise from `image.test.js`, not a failure.
- `npm run build` → green; new bundle `index-hJHUneNL.js`.
- Could NOT verify live (egress proxy blocks the Render API from this container) — offline tile behaviour and the slider fallback want a device check: load the card online, toggle the browser offline, confirm the map is replaced by the slider message (and, after viewing an area online, that the last tiles still draw).

## Commit(s)
- `<hash>` — feat(neighbourhood): offline map fallback (slider) + page tile cache; aria label

## Follow-ups
- [ ] Device check offline map swap + last-viewed tiles drawing from cache (SW must be v39 / fresh bundle).
