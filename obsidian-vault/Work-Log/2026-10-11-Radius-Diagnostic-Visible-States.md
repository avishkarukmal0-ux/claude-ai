# 2026-10-11 — Radius figures: visible states + on-card diagnostic (why nothing showed)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** Neighbourhood Insights · Frontend
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Symptom
Owner (Render+Vercel on `6678a79`, env set, centroids in `vendora_pilot`): on "Your area" the map circle moves
with the slider but NO "People in X / Households" block appears — and no amber/grey message either. Totally silent.

## Likely cause (not fully verified — needs the new on-card diagnostic or the Network tab)
A **stale frontend bundle** + a **silent `idle` state**:
- Map + slider shipped in `54a1df8`; the radius fetch + `radState` blocks shipped in `87b8ad5`. "Map shows,
  slider shows, no radius block at all" is exactly a **pre-`87b8ad5`** bundle still running in the installed PWA.
- The hand-rolled SW (`public/sw.js`, v5) is unchanged between frontend builds, so a frontend-only deploy fires
  **no update prompt**; navigations are network-first (a full reload WOULD fetch the new hashed JS), but an
  installed PWA the owner hasn't reopened keeps the old JS.
- Compounding it: `radState` starts `idle`, and `idle` rendered **nothing** — so even on the new bundle a
  non-firing effect would be invisible.
Backend is fine (`/api/pwa-insights/status` now auths instead of 404 → router mounted).

## Changes (frontend only)
- `components/insights/RadiusFigures.jsx` (new): presentational block for the radius figures. Renders a visible
  state for **loading / ok / unconfigured / locked / error**, and a small grey **diagnostic line**
  `radius: <state> (<http>)` so the owner can see the request outcome without DevTools. The card is owner/manager
  only (the `/area` + `/radius` routes are role-gated), so the line is never shown to staff.
- `NeighbourhoodAreaCard.jsx`: capture the last radius HTTP status (`radHttp`); replace the inline state blocks
  with `<RadiusFigures>`. The debounced radius effect is unchanged.
- Tests: new `RadiusFigures.test.jsx` (6 — every state + the diagnostic + "no numbers unless ok"); extended
  `neighbourhood.test.js` (+2 — `getRadiusProfile` hits `/radius?postcode=&radiusM=` and throws `.status` on
  non-ok, e.g. 403).

## What this fixes vs. what it diagnoses
- **Fixes** the silent-`idle`/invisible-state gap: every outcome now shows something + a code.
- **Diagnoses** the stale-bundle question: if, after a hard reload, the `radius: …` line is PRESENT, the new
  bundle is running and the code reads the HTTP status (403 locked / 404 route-missing / 200 unconfigured / 200
  ok). If the line is ABSENT, the bundle is still stale → unregister the SW / clear site data.
- **Not changed:** the SW update behaviour (intentionally prompt-driven, audit F10) — a proper auto-update prompt
  for frontend-only deploys is proposed as a follow-up, not forced in now.

## Verification
- FE: new tests 12/12; full suite **384/384**; `npm run build` green. Backend unchanged.
- **Not fully verified yet:** the live render of the new bundle + the actual `/radius` outcome on Render — owner
  must reload (the sandbox can't reach the live site; proxy 403 / DNS ENOTFOUND, confirmed earlier).

## Rollback
- `git revert <sha>` of this commit restores the inline blocks. Isolated, frontend-only.

## Exact next step for the owner
1. **Hard-reload / reopen the PWA** (or DevTools → Application → Service Workers → Unregister, then reload) to pick
   up the new bundle. No Render deploy needed (frontend-only; Vercel already has it).
2. On "Your area" → "Your catchment", read the small grey **`radius: …`** line:
   - `radius: ok (200)` + numbers → working.
   - `radius: locked (403)` → `INSIGHTS_TEST_UNLOCK` not `true` (or not redeployed).
   - `radius: error (404)` → backend not on the new build (`/radius` missing).
   - `radius: unconfigured (200)` → `INSIGHTS_DATA_PROVIDER` unset OR Render's `MONGODB_URI` points at a DB without
     the centroids (you imported into `vendora_pilot` — confirm Render uses the same).
   - **No `radius:` line at all** → still a stale bundle; clear site data / unregister SW.

## Commit(s)
- `fix(neighbourhood): visible radius states + on-card diagnostic (radius: state/http)`

## Follow-ups
- [ ] Owner: reload, report the `radius: …` line.
- [ ] Proposed: SW auto-update prompt for frontend-only deploys (so users aren't stuck on an old bundle).
- [ ] Remove/flag-gate the diagnostic line once the feature is confirmed working.
