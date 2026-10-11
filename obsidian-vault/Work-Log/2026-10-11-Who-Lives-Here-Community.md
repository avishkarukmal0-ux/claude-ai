# 2026-10-11 (part 5) — "Who lives here": community make-up of the radius (stock for your area)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** Neighbourhood Insights · Frontend · Backend (Nomis provider)
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Context
Owner: *"can't we add from which countries are the people around in that particular area, so it's easy for them to give the
products for the people."* The core Insights value — see who lives around the shop and stock for them. Chose (via question)
**all three** breakdowns: **main language**, **ethnic group**, **country of birth**. Placement: default to the free
**"Your area"** card (where they test, via test-unlock), on demand; country of birth also appears on the paid view.

## Changes
### Backend
- `insightsService.js` `CATEGORIES`: added `{ key: 'countryOfBirth', label: 'Country of birth', table: 'TS004' }` (first in
  the list). It flows into `preview()` and the full profile automatically.
- `insightsData/nomis.js`:
  - `DEFAULT_TABLES.countryOfBirth` = TS004, dataset **`NM_2024_1`** / dim `c2021_cob_12` — a **documented but UNVERIFIED**
    starting value (confirm with `scripts/verify-insights.js`, or override via `INSIGHTS_NOMIS_TABLES_PATH`). The
    auto-detect parser reads whatever dimension Nomis actually returns, so the hint need not be exact.
  - New `safeFetchTable()` — the breakdown tables (ethnic group, language, country of birth) are now fetched **safely**:
    a wrong/unverified id or a transient Nomis error yields `{}` instead of rejecting the whole profile. So a bad TS004 id
    **cannot** break the population/household headline or the other breakdowns — country of birth just shows empty.
  - `fetchTable` returns `{}` when a table has no `dataset` configured (so an intentionally-unset table is empty, never wrong).
  - `fetchAreaProfiles`: age + household are still fetched strictly (the headline); the three breakdowns are fetched with
    `safeFetchTable` in the full (non-headline) path only. `categories` now includes `countryOfBirth`.
- `pwaNeighbourhoodRoutes.js` `GET /radius`: `full=1` returns the FULL profile (with the breakdowns); default stays
  headline-only (people + households, 2 tables, fast). The free card requests `full=1` only when the owner opens the section.

### Frontend
- New `RadiusCommunity.jsx` — presentational: renders Country of birth / Ethnic group / Main language as short (top-6)
  bar lists, with the estimate + small-cell ("fewer than N") honesty, and an honest note when a breakdown is empty (country
  of birth → "needs verifying on the server").
- `NeighbourhoodAreaCard.jsx`: a collapsible **"Who lives here — stock for your community"** section under the radius
  figures (only when the headline figures are `ok`). Opening it fetches the full profile on demand (`full: true`),
  debounced + session-cached per `{postcode, radius}`, and re-fetches when the radius changes while open. The fast
  headline is unchanged.
- `NeighbourhoodInsightsView.jsx` (paid): added `countryOfBirth` to `CAT_LABEL` so it renders in the existing category loop
  (ethnic group + language already showed there).
- `neighbourhoodClient.getRadiusProfile({ postcode, radiusM, full })` — appends `&full=1`.

## Honesty / safety
- Country-of-birth numbers are **not trusted until the owner verifies** the Nomis id live (`verify-insights.js` prints the
  country rows if correct, empty if not). Until then the section shows the honest "needs verifying" note — never fabricated
  or mislabelled numbers. Fault isolation guarantees it can't take down the rest.
- All figures remain ESTIMATES (centroid-in-radius, whole OAs) and disclosure-controlled (small cells suppressed).

## Verification
- BE insightsData/service/geo **38/38** (incl. +new: full profile now fetches 5 tables incl. NM_2024_1; broken
  country-of-birth is fault-isolated; headline still only 2) + app loads.
- FE full suite **390/390** + build green.
- **Not live-verified** (sandbox can't reach Nomis). Needs a **Render redeploy** (backend change), then the owner runs
  `verify-insights.js` to confirm the TS004 id (or set the override) before trusting country-of-birth figures.

## Rollback
- `git revert <sha>` — isolated.

## Next step for the owner
1. **Redeploy the Render backend.** Reload the PWA → on "Your area", tap **"Who lives here"**: language + ethnic group
   should populate; **country of birth** will show numbers only if `NM_2024_1` is the right dataset.
2. If country of birth is empty: run `node scripts/verify-insights.js <postcode>` to find the correct TS004 dataset id, then
   set it via `INSIGHTS_NOMIS_TABLES_PATH` (a JSON overriding `countryOfBirth.dataset`). No code change needed.

## Commit(s)
- `feat(insights): "Who lives here" — country of birth + ethnic group + main language for the radius`

## Follow-ups
- [ ] Owner: verify the TS004 (country of birth) Nomis dataset id live; set the override if `NM_2024_1` is wrong.
- [ ] Carry-over: remove/flag-gate the grey `radius:` diagnostic line once confirmed working live.
