# 2026-10-10 (part 5) — Neighbourhood Insights: catchment map + adjustable radius (km/mile)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Deployment-Config]] · Neighbourhood Insights (PAID add-on)
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Add a real street-map with a radius circle around the shop to the PAID Neighbourhood Insights view, with a
km↔mile toggle and any radius in between, so owners can see their catchment and the in-radius census figures
update together. Decisions (asked): map + figures, both units, real OSM tiles, **all paid** (Insights view only),
online-only. Reuse the existing centroid-in-radius engine; do not rebuild it; don't touch the free "Your area"
card, auth, or billing.

## Changes
**Backend**
- `config/index.js` (`neighbourhoodInsights`): added `minRadiusM` (250) / `maxRadiusM` (5000, ~3.1 mi) env-tunable
  (`INSIGHTS_MIN_RADIUS_M` / `INSIGHTS_MAX_RADIUS_M`), and a `tiles` block (`urlTemplate` default OSM, `userAgent`,
  `attribution`, `maxZoom`, `timeoutMs`; `INSIGHTS_TILES_*`). Presets `radii` kept.
- `services/insightsService.js`: `buildProfile` now accepts ANY radius in `[min,max]` (rounded), not just a preset;
  added `radiusBounds()`; `status()` surfaces `radiusBounds`.
- `services/insightsTiles.js` (new): `isValidTile(z,x,y)` (pure; guards against arbitrary upstream URLs/coords),
  `tileUrl`, `fetchTile` (injectable transport, sets the OSM User-Agent).
- `routes/pwaInsightsRoutes.js`: `GET /tiles/:z/:x/:y.png` (owner/manager) — validates coords, proxies the tile
  from the configured host server-side, returns it with a 1-day cache header. **Browser never calls the tile host
  directly → no CSP change on either side.**

**Frontend**
- `leaflet@^1.9.4` added. `lib/insightsClient.js`: `tileUrl` + `fetchTileObjectURL` (fetches each tile WITH the
  PWA bearer header → blob URL, so the tile route stays authed; Leaflet `<img>` can't send headers).
- `components/insights/RadiusMap.jsx` (new): plain Leaflet; a custom `AuthTileLayer` (authed blob tiles, revoked
  on load), a `circleMarker` shop centre (no external marker asset to break), and a radius `circle`; re-fits on
  radius change. OSM attribution shown.
- `components/insights/NeighbourhoodInsightsView.jsx`: km↔mile toggle, per-unit presets + a slider clamped to the
  server bounds, the map rendered once the postcode resolves (even before census figures are configured — the
  location comes back either way), and a **debounced auto-rebuild** on radius change so the circle + figures move
  together. Attribution line under the map.

## Decisions
- **All paid:** the map + radius live only in the entitlement-gated Insights view; the free "Your area" card is
  untouched. Protects the add-on.
- **Tile proxy over direct OSM:** keeps the browser calling only our origin (the project's core rule) and needs no
  CSP edit in `vercel.json` or helmet. The tile route is owner/manager (not entitlement) gated — tiles are public
  OSM, the paid data is the `/profile` figures, and the map only renders after a profile anyway.
- **circleMarker not L.marker:** avoids Leaflet's bundler-broken marker-icon asset.
- **Online-only** (per the ask): no tile caching/offline; the view just needs a connection.

## Gotchas
- A real street map can't meaningfully cache offline — accepted (online-only).
- The map circle renders from `location.point` even when census data isn't configured; the **figures** inside it
  still require the OA-centroid file + `INSIGHTS_DATA_PROVIDER=nomis` (owner data step) — never faked.
- `maxRadiusM` is bounded partly by the engine's `maxOutputAreas` (2000) cap; a very large radius in a dense city
  truncates — 5000 m is a safe default.

## Verification
- Backend: `insightsService` + new `insightsTiles` tests **22/22**; `node -e "require('./src/app.js')"` loads OK.
- Frontend: `npm run build` green (Leaflet +~155 KB; pre-existing chunk-size warning); full suite **376/376**.
- **Not fully verified yet (owner-run):** live tiles render + a live `/profile` with real figures need the
  deployed backend + the OA-centroid data + entitlement; sandbox egress to OSM/Nomis/postcodes.io is blocked.

## Commit(s)
- `feat(insights): catchment map + adjustable km/mile radius (paid Insights view)`

## Follow-up (same day) — map + radius ALSO on the free "Your area" card (for testing/visibility)
The owner was on the free "Your area" card and couldn't see the radius (it was paid-view only). They asked to see
it there for testing. Added the **catchment map + radius control to the free `NeighbourhoodAreaCard`** too — the
circle is a VISUAL guide around the shop (its own coordinates), while the radius-AGGREGATED census figures remain
the paid add-on (the free card's figures stay single-LSOA, clearly labelled "not the circle"). Works with just
`NEIGHBOURHOOD_ENABLED` — no subscription, no `INSIGHTS_ENABLED` needed.
- Backend: `neighbourhoodService.resolvePostcode` now returns `point {lat,lng}` (postcodes.io already provides
  them); stored on the cache doc (`lat`/`lng`, additive) and surfaced in the `/area` response `area.point`. New
  tile route `GET /api/pwa-neighbourhood/tiles/:z/:x/:y.png` (owner/manager) reusing `insightsTiles` — so tiles
  work under the free flag, independent of the paid Insights mount.
- Frontend: extracted `lib/radiusUnits.js` + `RadiusControl.jsx` (shared by both views, no drift); `RadiusMap`
  takes an injectable `fetchTile`; `neighbourhoodClient` got `tileUrl`/`fetchTileObjectURL`
  (`/api/pwa-neighbourhood/tiles`); the card shows the control + map when `area.point` exists (online only).
- Verify: BE neighbourhood+insights+tiles 43/43 + app loads; FE 376/376 + build green.

## Follow-ups
- [ ] Owner: redeploy backend (for `/api/pwa-neighbourhood/tiles` + `area.point`); on "Your area" confirm the map
      tiles load and the circle resizes with the radius. (Paid Insights still adds the people-by-radius figures.)
- [ ] Optional: raise `INSIGHTS_MAX_RADIUS_M` only if the OA cap is also raised for dense areas.
