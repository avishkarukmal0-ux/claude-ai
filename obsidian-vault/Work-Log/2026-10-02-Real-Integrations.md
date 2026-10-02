# 2026-10-02 — Real integrations: product-image storage, Nomis census data, Stripe billing

Back to [[Work-Log]] · [[Home]] · config in [[Deployment-Config]] · follows
[[2026-10-02-Feature-Product-Pictures]] + [[2026-10-02-Feature-Neighbourhood-Insights]]

**Domain(s):** Product images (backup lifecycle), Insights (census DATA provider), Billing (Stripe).
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Turn the three seams left as "documented stubs" into REAL integrations, test everything that can be tested
offline, write the DB/live tests so the owner can run them, and keep it reviewable WITHOUT deploying or
charging live.

## Verification of the starting state (before changing anything)
- Flags: `PRODUCT_IMAGES` / `VITE_PRODUCT_IMAGES`; `INSIGHTS_ENABLED` / `VITE_INSIGHTS_ENABLED`
  (+ `INSIGHTS_DATA_PROVIDER`, `INSIGHTS_BILLING_PROVIDER`).
- Stubs: census provider `require('./insightsData/<name>')` had **no file**; `/checkout` threw 501; the
  webhook was a shared-secret stub (not Stripe-signed, no raw body, no idempotency).
- Product-image backup was fire-and-forget: **no pending/backed-up/failed state, no retry, delete never
  removed the server copy.**
- Durability: GridFS = MongoDB/Atlas, so backup already survives a Render restart (NOT the ephemeral disk). ✓
- Env blocked both live calls (postcodes.io/Nomis/Stripe → 403) and a local Mongo (no mongod binary; the
  in-memory server's download is 403 too) → DB/live tests can't run here; offline logic can.

## Changes
**Product images (core)**
- `lib/productImages.js`: backup STATE MACHINE (`local|pending|backed-up|failed`) in a per-device map, retry
  queue (`retryBackups`/`flushBackups` + `registerBackupAutoRetry` on online/visibility), `deleteBackup`
  (removes the authorised server copy), second-device recovery marks `backed-up`. Test seam
  `__setBackupAvailability`.
- `components/common/ProductImage.jsx`: backup badge + retry; delete now removes the server copy; undo
  re-uploads. `App.jsx` wires the auto-retry.
- Tests: `productimages.test.js` +6 (lifecycle, retry, 2nd-device, delete). `pwaImage.integration.test.js`
  +4 (2nd-device recovery via re-login, catalogue source, authorised delete, cross-shop delete).

**Neighbourhood data (Nomis)**
- `services/insightsData/centroids.js`: loads ONS OA (2021) PWC file (CSV/NDJSON) once; honest `configured:
  false` with no file.
- `services/insightsData/nomis.js`: `fetchAreaProfiles` = centroid-in-radius select → batched Nomis
  `.data.json` fetch (TS021/TS024/TS007A/TS003) → per-OA profiles; node-cache + AbortController timeout;
  generic parser (sums by description, drops Total). Dataset ids are documented defaults to verify.
- `scripts/verify-insights.js`: operator reconciliation tool vs official ONS figures.
- Tests: `insightsData.test.js` (6) — radius variation → different totals, population/household derivation,
  suppression preserved, no-centroids throws.

**Billing (Stripe, test mode)**
- `services/billing/stripeBilling.js`: client (refuses `sk_live_` unless `BILLING_ALLOW_LIVE`), `resolveSaleMode`
  (recurring only when data configured, else one-off/off), `createCheckout` (core + optional add-on on one
  subscription; or one-off report), `previewAddonProration`, `cancelAddon`, `constructEvent` (raw-body
  signature), pure `mapEvent`.
- `models/ProcessedBillingEvent.js`: idempotency ledger (unique eventId, TTL). `models/Account.js`:
  entitlement gains plan + stripe ids + `lastEventAt/Id` ordering guard.
- `services/insightsEntitlementService.js`: `decideIngest` (dup/out-of-order, pure), `ingestProviderEvent`
  (resolve shop by metadata/customerId, dedupe, ordering, apply), identifier mapping in `entitlementPatchFor`.
- `routes/pwaInsightsRoutes.js`: real `/billing/stripe/webhook` (raw, signed) + unified ingest on the generic
  webhook; real `/checkout`; `/billing/preview`; `/billing/cancel-addon`. `app.js`: raw body for the stripe
  webhook path only. Frontend: `insightsClient` (+cancelAddon/preview) + `ManageAddon` UI.
- Tests: `billing.test.js` (21) — signature verify + forgery reject (real HMAC), event mapping, sale mode,
  idempotency/ordering, patch mapping. `pwaInsights.integration.test.js` +5 (core-without-add-on, duplicate,
  out-of-order, signed Stripe webhook grant + forged reject).

## Verification (this environment)
- Frontend: **346/346** Vitest green; production build clean.
- Backend DB-free: insightsGeo (10) + insightsService (16) + **insightsData (6)** + **billing (21)** +
  money/productLookup etc. green. App loads with ALL features on. Live-key guard verified.
- **Could NOT run here:** DB-gated integration suites (no Mongo) and any live ONS/Nomis/postcodes.io/Stripe
  call (egress blocked). Those are written to run on the owner's `VENDORA_TEST_URI` + real keys.

## Remaining owner steps (blockers to "live")
- Download the OA PWC centroids file; set `INSIGHTS_CENTROIDS_PATH`; run `verify-insights.js` and reconcile
  the Nomis dataset ids/dimensions against published ONS figures.
- Create Stripe TEST prices + a webhook endpoint; set the price ids, `INSIGHTS_STRIPE_WEBHOOK_SECRET`,
  `INSIGHTS_SALE_MODE`.
- Run the integration suite against a disposable test Mongo.

## Commit(s)
- (this session) product-image backup lifecycle · Nomis data adapter + verify script · Stripe billing
  (adapter + idempotent signed webhook + entitlement) · integration tests + .env.example + docs.

## Not done / out of scope
- No deploy, no live charges, no production secrets touched (per the task).
- Interactive confirm-map tiles provider still a future item; one-off report UX is minimal (checkout link).
