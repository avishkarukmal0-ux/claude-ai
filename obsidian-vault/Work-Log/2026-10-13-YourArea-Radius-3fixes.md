# 2026-10-13 — Your area: /radius 3 fixes (A/B/C)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Buying]] · [[API-Routes]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Fix the never-finishing /radius call and the radius-control a11y/sizing on "Your area".

## Changes
**A — /radius never finishes**
- `backend/.../pwaNeighbourhoodRoutes.js` — `/radius` now accepts **POST (body)** and GET (fallback) via a shared handler.
- `frontend/src/lib/neighbourhoodClient.js` `getRadiusProfile` — **POST body** (postcode out of URL), accepts a caller `signal`, own **30s AbortController timeout** linked to it, **POST→GET fallback** on a plain 404.
- `NeighbourhoodAreaCard` — both radius effects now create an `AbortController` and **abort the in-flight request on cleanup** (dep change / unmount), so a radius/postcode change fires **one** request, not 4 overlapping ones. A 30s timeout → `radState='timeout'`.
- `RadiusFigures` — new `timeout` state: "Couldn't count people in this radius." + **44px Retry** (`onRetry`); card bumps a retry nonce (effect dep) to re-fire.

**B — sizes ≥44px / text ≥12px**
- Card: Refresh latest, Clear postcode (×), "Who lives here" → 44px.
- `RadiusControl`: Slider / Map zoom, mi / km, presets → 44px.
- `RadiusMap`: Leaflet zoom +/- → 44px via a CSS override in `src/index.css`.
- Raised the 9px radius-diagnostic line + 12px chips to `text-xs` (12px).

**C — input a11y**
- Postcode input gets `aria-invalid` (on invalid/empty) + `aria-describedby="area-error"` (the `role="alert"` region now carries `id="area-error"`), with a danger border when invalid.

## Verification
- `npx vitest run` → 80 files, **538** pass (+ radius POST-body, GET-fallback, abort tests). `npm run build` green; backend `app.js` loads; 375px public flow 0 console errors.
- **COULD NOT verify:** whether `/radius` ever returns from Render — the sandbox egress blocks the Render host, so no curl. If `INSIGHTS_TEST_UNLOCK` is off on the server it returns **403** immediately (card shows "paid add-on"); if on, it runs the Nomis aggregation (slow). Either way the 30s timeout now stops the UI hanging. Needs a real token/curl on your side.

## Commit(s)
- `<hash>` — SW v34→v35. Backend /radius POST awaits your manual Render deploy; GET fallback covers the interim.

## Follow-ups
- [ ] Manual Render deploy so POST /radius is live; then confirm a real /radius request/response.
