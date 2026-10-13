# 2026-10-13 — Your area: offline radius (catchment) cache

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Domains-Index]] — Neighbourhood Insights ("Your area" free card)
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Follow-up to [[2026-10-13-YourArea-map-offline]]. The radius/catchment figures (people + households in the circle) were **never persisted** — they only ever came from a live `/radius` call and were held in an in-session ref cache. So offline the whole catchment `<section>` was hidden (gated on `!result.offline`): the figures *and* the Slider disappeared. Persist the last radius result per postcode and show it offline as a dated, read-only copy with the control disabled. (Radius slowness did not reproduce — 4/4 fast — so the 30s timeout + Retry stay untouched; re-check after next deploy.)

## Changes
- `frontend/src/lib/neighbourhoodClient.js` — new durable store `neighbourhood_radius_v1` (workspace-scoped, per shop): `getStoredRadius(postcode)` / `putStoredRadius(postcode, {radiusM, profile, diag})` keep the **last** radius result per postcode with a `fetched_at`. Only a real (configured) profile is ever saved. `clearStored` now also drops the saved catchment so "Clear postcode" really removes everything.
- `frontend/src/components/insights/NeighbourhoodAreaCard.jsx` — `catchmentReadOnly = !online || result.offline`. When read-only: the catchment section still renders **if** a saved radius exists for the postcode (`offlineRadiusRec`), the radius effect **stands down (no /radius fetch)**, the slider is **disabled**, the map is replaced by the slider fallback (folded `result.offline` into `mapUsable`), and the figures render from the saved copy. A small effect syncs `radiusM` to the saved radius so the circle/label line up. On a successful online fetch the result is now **persisted** via `putStoredRadius`. "Who lives here" is hidden when read-only (needs the network).
- `frontend/src/components/insights/RadiusFigures.jsx` — new `state === 'cached'` renders the people/households tiles exactly like `ok`, preceded by an amber "Showing your last saved catchment from <date>" badge and a "Saved copy — reconnect to update as you move the radius" note (vs the live "Re-sums as you move the radius").
- `frontend/src/components/insights/RadiusControl.jsx` — new `disabled` prop disables the presets + slider (dimmed) for the read-only offline view.
- `frontend/public/sw.js` — CACHE_VERSION `v39 → v40` (JS-only change; bump so the Refresh prompt surfaces the fix).
- Tests: `frontend/src/lib/__tests__/neighbourhood.test.js` — durable radius cache (store/read case-insensitive, never store a null profile, clearStored drops the catchment).

## Decisions
- **One entry per postcode** (the last radius looked at), as the user asked — not per-radius. Simpler, and offline you want "the figures I last saw here", not a matrix.
- **Never fetch `/radius` offline.** It would just time out/error; the durable copy is the honest answer. Online error handling (timeout → Retry) is unchanged — the user explicitly said to keep it.
- **Read-only, not editable.** The slider is disabled offline because a new radius can't be summed without the server; re-enabling on reconnect is automatic (`catchmentReadOnly` flips false).
- Online, non-offline behaviour is byte-for-byte unchanged (`catchmentReadOnly` false, `offlineRadiusRec` null) — purely additive.

## Gotchas
- Two amber "saved copy" banners can show together offline — one for the LSOA area figures, one for the catchment. Intentional: they're different datasets with different save times.
- `offlineRadiusRec` is read from storage at render time (cheap localStorage/mem read) to avoid a one-frame flicker where the section would pop in after an effect; the radiusM-sync effect guards against a setState loop by only setting when the value differs.
- `mapUsable` now also excludes `result.offline`, so a saved-copy area never tries to draw a live map.

## Verification
- `npx vitest run src/lib/__tests__/neighbourhood.test.js` → 18 passed.
- Full FE suite: **544 passed** (80 files). `npm run build` green; new bundle `index-vhCysoZa.js`.
- Could NOT verify live (Render egress blocked from the container). Device check wanted: online → look up an area, note the people/households; go offline → the Slider stays (disabled) and the figures show with "Showing your last saved catchment from <date>"; "Clear postcode" removes them.

## Commit(s)
- `<hash>` — feat(neighbourhood): cache last radius per postcode; show read-only offline

## Follow-ups
- [ ] Device check offline catchment (figures + disabled slider + dated label) on SW v40 / fresh bundle.
- [ ] Re-check radius timing after the next Render deploy (slowness didn't reproduce this round).
