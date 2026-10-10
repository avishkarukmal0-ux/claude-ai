# 2026-10-10 (part 2) — Neighbourhood: cache refetch for new figures + force-refresh + age length

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Deployment-Config]] · Neighbourhood ([[2026-10-10-Neighbourhood-Post-Live-Fixes]])
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Mid-year population (NM_2014_1) still wasn't showing after the owner added `NEIGHBOURHOOD_DS_POP_MID` on Render.
Root-cause + fix the cache so a newly-configured figure appears without waiting 7 days, add an owner force
refresh, and bound the age card's length after the earlier slice removal. Minimal change; Brevo/auth/billing
untouched.

## Root cause
`neighbourhoodService.decideRefresh` only re-fetched on TTL expiry (168 h) or a newer dataset `last_updated`.
RM10 8AA was cached earlier the same day *without* POP_MID, and the frontend never sends `?force=1`, so the new
figure wouldn't surface until the TTL. (Owner deleted that one Atlas doc as a one-off; this fix makes that
unnecessary going forward.)

## Changes
- `backend/src/models/NeighbourhoodArea.js` — added optional, non-breaking `attemptedKeys: [String]` and
  `lastAttemptAt: Date` (default `undefined`; old docs still valid).
- `backend/src/services/neighbourhoodService.js`
  - `decideRefresh(...)` now also refetches when the cache is **missing any currently-configured figure key**,
    with a throttle: a never-attempted missing key → refetch once; afterwards (recorded in `attemptedKeys` +
    `lastAttemptAt`) a still-missing key is retried only after **1 h** (`missingRetryMs`, default 3600000).
    TTL/`force`/dataset-`last_updated` behaviour unchanged; `configuredKeys` defaults to `[]` (back-compat).
  - `getAreaProfile(...)` computes `configuredKeys` and passes them to `decideRefresh`, and **records the attempt
    on every refetch outcome** — success upsert, "reachable but no figures" (existing doc), and upstream error
    (existing doc) — so an outage or perpetually-missing figure backs off to hourly, never per-request.
- `frontend/src/lib/neighbourhoodClient.js` — `getArea(postcode, { force })` appends `&force=1` (the `/area`
  route already accepted it; owner/manager-gated server-side).
- `frontend/src/components/insights/NeighbourhoodAreaCard.jsx`
  - **"Refresh latest"** action (hidden when offline) → `load(true)` → `getArea(..., { force:true })`.
  - `BreakdownFigure` shows up to **8** rows by default with a **"Show all N / Show fewer"** toggle. Qualifications
    (7) and economic activity (~5) show in full and sum to ~100%; age (~18 bands) collapses, nothing hidden.

## Decisions
- **No schema-breaking change** — the two new fields are optional and absent on old docs (which then behave as
  "never attempted" → refetch once when a key is missing, exactly what we want for the already-cached RM10 8AA).
- **Age:** chose "top-N + expand" over re-sorting age into age order — minimal, keeps the value-sorted parser
  output, bounds length, hides nothing. Age-order sort is a possible later polish.
- **No CSS change for the reported "overlap":** inspected `BreakdownFigure`/card — no fixed height, `overflow`,
  or absolute/fixed positioning; cards stack with `space-y-2`. The "...and a full-time student" row is a TS066
  economic-activity label (the next card) — a screenshot-stitch artefact, not a real overlap.

## Gotchas / recommendations (in [[Deployment-Config]])
- Atlas IP list is `0.0.0.0/0` because Render free has no static outbound IP; recommend a least-privilege app DB
  user (`readWrite` on the app DB) for Render instead of the shared `atlasAdmin`, and keep `atlasAdmin` for
  owner-side imports. Password rotated 2026-10-10 (Render `MONGODB_URI` updated; no secrets in files).
- `NEIGHBOURHOOD_DS_DEPRIVATION=NM_2031_1` (TS011) is a no-op (deprivation is from the IMD import).

## Verification
- `backend`: neighbourhood tests **21/21** (+5: refetch cases a-d + back-compat); `node -e "require('./src/app.js')"` loads OK.
- `frontend`: neighbourhood client **4/4**; full suite **371/371**; `npm run build` green.
- Live `/area` behaviour (postcodes.io/ONS/Nomis) stays owner-run — sandbox egress blocked.

## New refetch rule — exact behaviour
`decideRefresh` returns **true** (→ getAreaProfile re-fetches) when: no record; age > TTL; dataset
`last_updated` newer; **or** a configured key is missing AND (never attempted **OR** `now - lastAttemptAt > 1 h`).
Otherwise **false** (serve cache, no upstream call). IMD `deprivation` is never in `configuredKeys`, so it
neither forces nor blocks a refetch.

## Commit(s)
- `fix(neighbourhood): refetch cache when a newly-configured figure is missing + force refresh + age expand`

## Follow-ups
- [ ] Owner: with POP_MID set, confirm mid-year population now shows for RM10 8AA (should appear on the next
      request now, or via "Refresh latest"); verify the period label matches Nomis `time=latest` (~1,513).
- [ ] Owner (security): add a least-privilege Render DB user; optionally remove the no-op DEPRIVATION var.
- [ ] Optional later: sort the age breakdown in age order rather than by value.
