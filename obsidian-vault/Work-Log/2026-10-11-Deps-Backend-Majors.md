# 2026-10-11 (part 20) — Backend dependency majors → 0 prod advisories (+ centroids test fix)

Back to [[Work-Log]] · [[Home]] · prev [[2026-10-11-Audit-Fixes-Batch11-CI-Deps]]

**Domain(s):** Dependencies · Tests
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Done (one package at a time, verified)
- **uuid `^9` → `^11.1.1`** + `overrides.uuid` so **node-cron**'s nested uuid is patched too (node-cron's only
  advisory was its vulnerable uuid — no node-cron major needed). The `{ v4 }` named import is stable across these
  majors; verified `v4()` works and node-cron still schedules.
- **qs → `overrides.qs = ^6.16.0`** (qs is transitive via express) — clears the qs DoS/array-bypass advisories.
- **csv-parse `^5` → `^7.0.3`** — used only in the two owner-run import scripts (`import-imd`, `import-centroids`)
  via the streaming `parse({ columns, skip_empty_lines, bom, trim })` API, which is unchanged in v7 (smoke-tested).

Result: backend **production advisories 4 → 0** (`npm audit --omit=dev`). Dev-only advisories (nodemon/jest/babel/
braces) are not production-exploitable and are left (a nodemon downgrade would be worse) — matches the audit's
"check reachability before assigning severity."

- **Fixed a regression** the full test run surfaced: `centroids.test.js` used exact `toEqual({oa,lat,lng})` but
  `parseLatLng` now also returns `lsoa` (added for the B2/IMD radius average in `8b6a378`). Updated the assertions
  to include `lsoa` (null when absent) + a new case asserting an `LSOA21CD` column is carried through.

## Verification
- `npm audit --omit=dev` → **0 vulnerabilities**; app loads; csv-parse v7 stream smoke test ok; `v4()` ok; qs 6.16.0.
- Full backend `jest`: the ONLY failing suites are the 5 DB-integration ones (auth/sales/products/cashDrawer/
  lossPrevention) failing on the **mongodb-memory-server binary download** (pre-existing sandbox egress block — they
  pass in CI/real Mongo, audit got 243/245). All pure suites pass (198), **centroids now green**. No new failures
  from the bumps. The new CI workflow runs the DB auth/sync suites against a real mongo service.

## Commit(s)
- `chore(deps): backend uuid@11 + qs@6.16 override + csv-parse@7 → 0 prod advisories; fix(test): centroids lsoa`

## Remaining
- [ ] Frontend **react-router major** (the last 2 frontend moderate advisories) — next, tested.
- [ ] Owner/infra: staging device-matrix, provider sandbox runs, restore drill; watch CI go green.
