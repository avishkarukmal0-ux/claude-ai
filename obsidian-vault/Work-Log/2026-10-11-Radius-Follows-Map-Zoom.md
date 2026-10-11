# 2026-10-11 (part 4) — Manual mode: the radius (and the figures) follow the map zoom

Back to [[Work-Log]] · [[Home]]

**Domain(s):** Neighbourhood Insights · Frontend
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Context
Owner: *"change the number to manual mode too, when the radius being zoom in and out from inside the map."* Until now the
radius was set only by the slider/presets; zooming the map just changed the viewport and did **not** touch the radius or the
figures. Asked how they wanted "change the radius from inside the map" to work (scroll-to-resize / drag-the-edge / follow-the-
view) → they chose **"Radius follows the map view"**: as you zoom the map in/out, the circle auto-fits what's visible around
the shop and the figures re-sum for that area.

## Changes (frontend only — opt-in, so the paid view is untouched)
- `RadiusMap.jsx`: new optional props `followView` + `onViewRadius`.
  - `inscribedRadiusM(map)` = half of the smaller viewport dimension in metres (the circle that fits inside the view). It
    depends on zoom + latitude, **not** on panning — so zooming resizes the radius, looking around does not.
  - When `followView`, a `zoomend`/`moveend` listener reports that radius to the parent (and emits once on turn-on so the
    radius matches what's already on screen). Crucially, in `followView` the radius-change effect **does not `fitBounds`** —
    re-fitting would fight the user's gesture and loop. In slider mode it still re-fits exactly as before.
  - No programmatic map movement happens in follow mode, so there's **no feedback loop** (map → radiusM → the effect only
    resizes the circle in place).
- `RadiusControl.jsx`: optional `mode` + `setMode`. When `setMode` is passed it renders a **Slider / Map zoom** toggle; in
  `map` mode the slider/presets are hidden (the map is the control) and a one-line hint explains it. The radius label + unit
  toggle stay visible in both modes. With no `setMode` (the paid Insights view) it's unchanged — slider only.
- `NeighbourhoodAreaCard.jsx` (free "Your area" card): new `radiusMode` state **defaulting to `'map'`** (so zooming works
  immediately — the owner's explicit ask), with the toggle to go back to the slider. `onViewRadius` **quantises to 50 m** and
  clamps to `[250, 5000]`, and skips no-op updates, so tiny zoom/pan jitter reuses the existing session + server caches
  instead of firing a Nomis fetch per pixel. The existing debounced+cached radius→figures effect already re-sums on
  `radiusM`, so the numbers sync with no new fetch path.

## Why it can't loop or thrash
- Slider mode: radius change → `fitBounds` → `moveend`, but there's **no** follow listener attached, so nothing recomputes.
- Map mode: user zoom → `moveend` → inscribed radius → `setRadiusM` (quantised) → circle `setRadius` **without** fit → no map
  movement → no further `moveend`. Panning at a fixed zoom gives the same inscribed radius → quantises to the same 50 m →
  no refetch.

## Verification
- FE insights components **17/17** (RadiusControl **5 new** + RadiusFigures 7 + NeighbourhoodAreaCard 5).
- FE full suite **390/390** (+5) + `npm run build` green (pre-existing chunk-size warning only).
- The inscribed-radius geometry runs against live Leaflet in the browser; jsdom can't exercise real map tiles/zoom, so the
  **live zoom→figures behaviour is owner-verified** (sandbox can't reach tiles/Nomis). The toggle + mode rendering are tested.

## Rollback
- `git revert <sha>` — isolated, frontend only.

## Next step for the owner
- **Frontend-only** → auto-deploys via Vercel. After a reload: on the "Your area" card, the radius control defaults to **Map
  zoom** — zoom the map in/out and the circle + the People/Households figures follow (first visit to each ~50 m step is a
  Nomis fetch, then cached; revisits are instant). Tap **Slider** to set it by hand as before. (No Render redeploy needed for
  this change.)

## Commit(s)
- `feat(insights): manual mode — radius (and figures) follow the map zoom on the Your area card`

## Follow-ups
- [ ] Optional: offer the same **Map zoom** toggle on the paid Insights view (props are already in place — just pass
      `mode/setMode` + `followView/onViewRadius` there too).
- [ ] Carry-over: remove/flag-gate the grey `radius:` diagnostic line once the figures are confirmed working live.
