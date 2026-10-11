# 2026-10-11 (part 2) — Radius figures showed 0: Nomis parse fix + OA-data diagnostic

Back to [[Work-Log]] · [[Home]]

**Domain(s):** Neighbourhood Insights (PAID engine) · Frontend
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Evidence (from the on-card diagnostic added earlier)
The new bundle loaded; the card showed **`radius: ok (200)`** with **"46 areas"** but **People = 0, Households = 0**.
So: centroid selection works (46 OAs in the circle), the request succeeds, but the **Nomis census counts parse to 0**.

## Root cause
The paid-insights census fetch (`insightsData/nomis.js`) is SEPARATE code from the working free feature. It
**hardcoded the Nomis dimension name** (`c2021_age_6`, etc.) in `parseObs` and **omitted the Nomis `uid`**. The free
feature works because it AUTO-DETECTS the varying dimension. If Nomis's real field name differs from the hardcoded
id, `parseObs` finds no category → every OA sums to 0 → headline 0 (while `outputAreas` still shows the 46 from the
selection). The insights dataset ids were also never live-verified (comment said "VERIFY with verify-insights.js").

## Changes
- `backend/src/services/insightsData/nomis.js`:
  - `parseObs` now PREFERS the configured dimension but FALLS BACK to auto-detecting the varying descriptive
    dimension (and reads the geography code flexibly) — so a dimension-name mismatch no longer loses the data.
  - `fetchTable` appends the server Nomis `uid` (`config.neighbourhood.nomisUid`) like the working feature.
  - Added `lastDiag()` — `{ oaCount, oasWithPopulation, sampleOa, sampleAgeCats, sampleHhCats }` so we can tell a
    query/dataset/geography miss (0 OAs with data) from a parse/sum issue.
- `backend/src/services/insightsService.js`: `buildProfile` attaches `diag` to the result.
- `frontend` `NeighbourhoodAreaCard` + `RadiusFigures`: the on-card diagnostic now shows
  `radius: ok (200) · <oasWithPopulation>/<oaCount> OA w/ data · sample <OA> age:<n> hh:<n>`.
- Tests: BE `parseObs` auto-detect (the 0-figures repro) — insightsData 7/7; FE `RadiusFigures` diag line — 7/7.

## Verification
- BE insights/data/service 23/23 (+auto-detect) + app loads; FE full suite 384/384 + build green.
- **NOT verified against live Nomis** (sandbox can't reach it). The auto-detect+uid is the highest-confidence fix
  for a 200-with-unparseable-data response, but if Nomis returns NO obs for OA-level queries (geography/dataset
  unsupported), the new `diag` will show `0/46 OA w/ data` after redeploy — then the dataset ids / OA geography
  need live verification (`scripts/verify-insights.js`), not a parser change.

## Rollback
- `git revert <sha>` — isolated.

## Exact next step for the owner
1. **Redeploy the Render backend** (this is a backend change) to the new commit.
2. Reload the PWA, move the radius, and read the grey `radius:` line:
   - **People/Households now > 0** → fixed. 🎉
   - Still 0 but **`… >0/46 OA w/ data`** → parse/sum edge; send me the line.
   - Still 0 and **`0/46 OA w/ data … age:0 hh:0`** → Nomis returned nothing for OA-level queries → the insights
     dataset ids / OA geography need live verification (run `scripts/verify-insights.js`); the fix is config, not code.

## Commit(s)
- `fix(insights): nomis parseObs auto-detects the dimension (+uid) so radius counts aren't 0; add OA-data diagnostic`

## Follow-ups
- [ ] Owner: redeploy backend, report the `radius:` line.
- [ ] If `0 OA w/ data`: verify the insights Nomis dataset ids / OA geography live; override via
      `INSIGHTS_NOMIS_TABLES_PATH` with the owner-verified ids if needed.
- [ ] Remove/flag-gate the diagnostic once confirmed working.
