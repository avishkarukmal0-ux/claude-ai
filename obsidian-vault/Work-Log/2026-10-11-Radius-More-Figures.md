# 2026-10-11 (part 8) — Economic activity, qualifications & deprivation follow the radius

Back to [[Work-Log]] · [[Home]]

**Domain(s):** Neighbourhood Insights (radius aggregation) · Frontend · Backend
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Context
Radius People/Households + "Who lives here" (country of birth / ethnic group / main language) now work live
(22,010 / 13,841 over 31 areas for RM10 8AA). Owner: the OTHER figure cards below — **economic activity**,
**qualifications**, **deprivation (IMD)** — come from the shop's single immediate area (LSOA) and don't move with the
radius. *"Make other 3 also change according to radius change."* Chose **all three** (via question).

## Changes
### Economic activity + Qualifications (counts → re-sum, like the others)
- `insightsData/nomis.js` `DEFAULT_TABLES`: added **economicActivity** (TS066, `NM_2083_1`) + **qualifications**
  (TS067, `NM_2084_1`) — the dataset ids the working free feature uses (confirmed from the live card's provenance).
  Fetched fault-isolated in the full (non-headline) path; added to each OA's `categories`.
- `insightsService.CATEGORIES`: added both.
- `RadiusCommunity.jsx`: two new sections (Economic activity, Qualifications) — so they re-sum as the radius moves.
- Paid view `CAT_LABEL`: added both (render in the existing category loop).

### Deprivation (IMD) — population-weighted AVERAGE across the radius
IMD is a per-LSOA **rank/decile**, not a count, so it can't be summed — it's averaged, weighted by population.
- `insightsGeo.weightedDeprivation(entries)` — pure, unit-tested (population-weighted decile + score).
- `OaCentroid` model + `centroids.js` loader + `parseLatLng`: added an **optional `lsoa`** on each centroid
  (LSOA21CD) — the OA→LSOA mapping needed to average IMD over the radius.
- `insightsService.radiusDeprivation(areas, imdLookup?)`: maps each radius OA → its LSOA (from the centroids),
  sums population per LSOA, looks up each LSOA's IMD (`imdService.getFigure`), and returns the population-weighted
  average decile/score. Attached to `profile.deprivation` on the full profile. **Null (honest fallback) when the
  OA→LSOA mapping isn't imported** → the UI keeps the shop's own-area deprivation card.
- `RadiusCommunity.jsx`: shows "Deprivation across this radius — Decile X of 10 · avg over N areas (estimate)" when
  `profile.deprivation` is present.
- `scripts/import-centroids.js`: carries `lsoa` into the upsert when the source file has it.

## Honesty
- Economic activity + qualifications are real census counts, re-summed exactly like People/Households.
- Deprivation is explicitly an **estimate / population-weighted average**, labelled as such, and only shown when the
  OA→LSOA mapping is available — never faked.

## ⚠️ To light up the radius DEPRIVATION
Re-import the centroids from a source that includes **LSOA21CD** (ONS "OA (2021) → LSOA → MSOA → LAD" lookup, or a
PWC export with the LSOA column) via `scripts/import-centroids.js`. Until then economic activity + qualifications
re-sum fine and deprivation stays the shop's own-area figure (labelled). Economic activity + qualifications need the
**Render redeploy** only (no re-import).

## Verification
- BE insightsData/service/geo **42/42** (+weightedDeprivation 2, +radiusDeprivation 2, +econ/quals in the full fetch) + app loads.
- FE full suite **400/400** + build green. SW bumped **v10→v11**.
- Not live-verified (sandbox can't reach Nomis); dataset ids for TS066/TS067 are the ones the live free card already uses.

## Rollback
- `git revert <sha>` — isolated.

## Next step for the owner
1. **Redeploy the Render backend** → economic activity + qualifications appear in "Who lives here" and re-sum with the radius.
2. To get **deprivation** to follow the radius: re-import centroids with the LSOA column (one command; see import script header).

## Commit(s)
- `feat(insights): economic activity + qualifications re-sum with the radius; IMD radius average (pop-weighted)`

## Follow-ups
- [ ] Owner: re-import centroids with LSOA to enable the radius deprivation average.
- [ ] Carry-over: remove/flag-gate the grey `radius:` diagnostic line once confirmed working live.
