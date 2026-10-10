# 2026-10-11 — Centroids import verified (V4) + docs/security hardening + test-unlock review

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Deployment-Config]] · Neighbourhood Insights (PAID)
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Owner verified the OA centroid import works (188,880 rows, BNG auto-converted). Three follow-ups: (1) correct the
docs (V4 dataset, BNG columns, SAFE PowerShell, verified numbers, enable checklist); (2) security-review the
test-unlock route; (3) propose licensing wording for the radius figures. Docs/review only — no deploy.

## Owner-verified state (11 Oct 2026)
- Source: ONS "Output Areas (December 2021) EW Population Weighted Centroids (**V4**)" (V3 superseded). CSV ~22 MB,
  **188,880 rows** (178,605 England + 10,275 Wales), 0 dups. Columns UPPERCASE **X, Y** (BNG eastings/northings),
  BOM present. `parseLatLng` handled all 188,880 (0 unparsed); lat 49.913–55.786, lng -6.353–1.756.
- Imported to **vendora_test + vendora_pilot** (188,880 upserted, 0 skipped); Atlas `oacentroids` ~189K docs,
  ~28 MB. Render live on `c97b03a`, `/health` db connected. **Radius figures still OFF** —
  `INSIGHTS_DATA_PROVIDER`/`INSIGHTS_ENABLED` not set yet (owner will).

## Changes (docs only)
- `scripts/import-centroids.js` header: V4 dataset name, UPPERCASE X/Y (BNG) note + auto-convert, verified
  numbers, and **SAFE PowerShell** (`Get-Credential`, never echo/Substring/Write-Host the URI, `Remove-Item
  Env:MONGODB_URI` after, rotate-if-shown).
- `Deployment-Config.md`: same dataset/column/verified details, the safe import block, the "radius figures still
  OFF — enable steps" checklist (paid vs test-unlock paths), and the **security-incident** record.

## SECURITY INCIDENT (logged, no secrets written)
A PowerShell helper line suggested in chat printed part of the Atlas connection string → the `vendora_test` DB
user's password was shown on screen. Owner is **rotating** the password + updating Render `MONGODB_URI` (11 Oct
2026). No password/URI stored. Hardening: import docs now mandate `Get-Credential` + forbid printing the URI;
recommend a least-privilege Render app DB user.

## Security review — test-unlock radius route (commit `87b8ad5`)
`GET /api/pwa-neighbourhood/radius` (file `backend/src/routes/pwaNeighbourhoodRoutes.js`):
- **Auth:** the router's `router.use` (lines 17-23) runs `pwaAuth.verifyAccess` + `assertMemberActive` on EVERY
  route → a valid PWA token is required.
- **Role:** `ownerOrManager` (lines 25-29) → staff get 403.
- **Flag:** the `/radius` handler first checks `config.neighbourhoodInsights.testUnlock`
  (`INSIGHTS_TEST_UNLOCK === 'true'`, config line in `neighbourhoodInsights`); when false it throws **403**
  `INSIGHTS_PAID` BEFORE doing anything. Default is **false**.
- **Verdict:** in production (flag off) the route 403s for everyone — entitled or not — so it cannot leak radius
  figures. It exposes only PUBLIC census aggregation for a postcode the owner themselves supplies (no other
  shop's data; cross-account isolation is unchanged). When `testUnlock=true` it is INTENTIONALLY available to any
  owner/manager without entitlement (the documented test switch); the paid `/api/pwa-insights/profile` route is
  untouched and still entitlement-gated. **No data-security issue.** Residual risk is commercial: leaving the
  flag on in production gives the paid aggregation away free.
- **Turn off:** unset `INSIGHTS_TEST_UNLOCK` (or ≠ 'true') on Render + redeploy (default off).
- **Optional hardening (NOT applied — awaiting approval):** a one-line startup `console.warn` when
  `testUnlock` is true, so it can't be silently left on.

## Licensing (proposal only — task 3)
The radius figures combine (a) ONS Census 2021 counts and (b) the ONS 2021 OA population-weighted centroids, which
are an OS-derived geography product. The ONS geography licences page lists the two required statements for such
products: *"Source: Office for National Statistics licensed under the Open Government Licence v.3.0"* and
*"Contains OS data © Crown copyright and database right [year]"* (source: https://www.ons.gov.uk/methodology/geography/licences —
surfaced via search; the portal's own download metadata should confirm the exact year). The free card's existing
`SourcesNote` already credits ONS (census) + an ONSPD line that includes *"Contains OS data …"* for the
postcode→area lookup, but the **radius figures' catchment geography (the OA centroids) is a separate OS-derived
product** and the **paid Insights `ProfileResult` attribution currently credits ONS only (no OS line)**.
**Proposed wording** (add where radius figures show — the card's radius block and the Insights `ProfileResult`
`Attribution`): *"Catchment areas: ONS 2021 Output Area population-weighted centroids — Source: Office for
National Statistics licensed under the Open Government Licence v3.0; Contains OS data © Crown copyright and
database right [year]."* **UNCONFIRMED:** the `[year]` (the released V4 product's OS database-right year) — confirm
from the download page metadata. Not implemented pending your OK.

## Verification
- BE: `centroids` 6/6, `insightsService`/`insightsGeo`/`insightsData` + `neighbourhood` suites green; app loads.
- FE: full suite + build green.
- **Not run (owner/live):** the real Atlas import, Render env changes, and a live radius `/profile` — all
  owner-run (sandbox has no DB/egress). "Not fully verified yet" for those.

## Commit(s)
- `docs(insights): centroid import V4 + safe PowerShell + security incident + enable checklist`

## Follow-ups
- [ ] Owner: set `INSIGHTS_DATA_PROVIDER=nomis` (+ `INSIGHTS_TEST_UNLOCK=true` to test on the free card, or
      `INSIGHTS_ENABLED=true` + entitled shop for the paid screen); verify `data.ready: true`.
- [ ] Approve the OA-centroid licensing line (above) → I'll add it to the SourcesNote + Insights attribution.
- [ ] Approve the optional `testUnlock` startup warning.
- [ ] Least-privilege Render DB user (recommended after the password exposure).
