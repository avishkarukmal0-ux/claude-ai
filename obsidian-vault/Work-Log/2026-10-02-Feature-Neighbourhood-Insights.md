# 2026-10-02 — Neighbourhood Insights (optional paid add-on)

Back to [[Work-Log]] · [[Home]] · config in [[Deployment-Config]] · follows [[2026-10-02-Feature-Product-Pictures]]

**Domain(s):** new — Insights (location, census method, entitlement, trials). Reuses requests/buy-list/sales.
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Aggregate ONS Census 2021 area profiles (E&W) within a radius of the shop, connected to real demand via
product trials, behind a server-enforced paid entitlement — all provider-gated and OFF by default. Verify
official datasets/licences/geography before building; never fabricate; don't deploy or set commercial terms.

## Research (verified; agent, cited in [[Deployment-Config]])
postcodes.io (location, OGL), ONS Census 2021 via Nomis (counts, OGL; TS021/TS024/TS007A/TS003/TS001/TS041),
ONS OA 2021 population-weighted centroids (OGL), disclosure control (record swapping + cell-key perturbation),
centroid-in-radius = ONS best-fit, Scotland/NI separate. Flagged: exact Nomis `NM_` ids / TYPE codes +
postcodes.io field vintages need a live (unblocked) confirm — sandbox egress to all these hosts is 403.

## Changes
**Backend**
- `services/insightsGeo.js` (pure): haversine, centroid-in-radius OA selection, `combineAreaProfile`
  (always `estimated:true` + method + OA count; small-cell suppression). 10 tests.
- `services/insightsLocation.js`: postcode→point+country (postcodes.io, pluggable transport); E&W-only, with
  Scotland/NI `supported:false`.
- `services/insightsService.js`: orchestration; census DATA provider OFF by default → `configured:false` +
  labelled preview, never fabricated numbers; honest meta + OGL attribution on every result.
- `models/Account.js`: `entitlements.neighbourhoodInsights` (additive, default none).
- `services/insightsEntitlementService.js`: server-enforced `isActive`/`hasAccess`/`setEntitlement` +
  pure `entitlementPatchFor` (purchased/renewed/payment_failed/cancelled/ended) + `applyBillingEvent`.
- `routes/pwaInsightsRoutes.js` (mounted only when `INSIGHTS_ENABLED`): `/status` + `/preview` (free,
  owner/manager), `/profile` (entitlement-ENFORCED, 402 otherwise), `/checkout` (503 until billing
  configured), `/billing/webhook` (shared-secret, pre-auth, provider-agnostic — client can't self-grant).
- `config.neighbourhoodInsights` (all providers default off/null; configurable price; no commercial terms).
**Frontend**
- `features.INSIGHTS_ENABLED` (default OFF) + `lib/insightsClient.js`.
- `components/insights/NeighbourhoodInsightsView.jsx`: coverage/data-age header; not-entitled → labelled
  preview + honest "purchasing unavailable"; entitled → postcode + radius → profile with ESTIMATED banner,
  population/households, category breakdowns (suppressed small cells), limitations + attribution;
  unsupported-region + not-configured states.
- `components/insights/TrialsPanel.jsx` + `lib/trialStore.js` (synced `trials_v1`): requests → trial → buy
  list → received → outcome from **confirmed SALE/WASTE movements** ("Not enough data" otherwise) →
  repeat/expand/stop. Four layers kept separate (published stats / shop records / suggestion / estimate).
- HomePage Buy-hub tile + `insights` screen (owner/manager, behind the flag); `MONEY_SCREENS += insights`.
  `trials_v1` added to STORE_NAMES + sync ALLOWED.

## Verification
- Backend: `insightsGeo` (10) + `insightsService` (16, incl. unsupported-radius/Scotland/not-configured +
  entitlement isActive + billing lifecycle mapping). DB-gated `pwaInsights.integration` (6: 402 without
  entitlement, webhook grant→access, per-shop isolation, failed-payment revoke, bad-signature, checkout 503)
  — **skipped here (no Mongo).** DB-free backend suite green; app loads with the add-on on and off.
- Frontend: `trials.test.js` (5). Full FE suite **341/341**; build clean.
- **Not live-verified:** no data/billing provider configured, sandbox can't reach ONS/Nomis/postcodes.io or a
  test Mongo — no real profile or purchase run. Documented.

## Commit(s)
- `26de2bb` method+config · `4d16906` Phase 2 backend · `e8c5e2a` Phase 2 frontend · `ed3d188` Phase 3 ·
  (this) Phase 4 billing lifecycle + enforcement.

## Limitations / unfinished
- Census data provider adapter + OA centroid load are documented config, not shipped (profiles say so).
- Interactive confirm-map needs a tiles provider (config) — v1 confirms via postcode + coordinates.
- Billing provider adapter (checkout + webhook normalisation) is a documented seam — no live charges.
