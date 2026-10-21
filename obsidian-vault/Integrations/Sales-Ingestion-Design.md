# Sales ingestion & stock-deduction — design decisions

Back to [[Home]] · [[POS-Compatibility-Matrix]] · [[Provider-Enquiries]] · [[Conventions]]

How automatic item-level sales become (optional) stock deductions without corrupting the shop's existing
counts or fighting offline sync. Written before wiring any deduction — the engine is **not built yet**; this
records the model it must follow.

## Authoritative stock (what exists today)
- **`inventory_v1` `product.qty`** is the authoritative on-device stock number — edited offline, merged
  per-item on sync, and (on merge) reconstructed as `opening + ledgerSum(movements within 180d)`.
- **`movements_v1`** is the append-only typed ledger (SALE/GOODS_RECEIVED/WASTE/RETURN/ADJUSTMENT/TRANSFER)
  with **`operationId` idempotency** (`hasOperation`) and **`batchId`** for reversals (`reverseByBatch`).
- **Existing `salesImportStore` (CSV)** appends `SALE` movements as **velocity evidence only — it does NOT
  change `product.qty`** ("the sale already happened and is already reflected in the counts").

## The overlap to resolve (important)
The brief wants sales to **actually reduce stock**. That is a *different philosophy* from today's "qty is
maintained manually; imports only inform velocity". If we naively start deducting on top of the current model
we **double-count** (the owner already decremented by selling; an imported sale would decrement again).

**Decision — a per-shop mode, defaulting to the safe one:**
1. **Observe / velocity (today's behaviour, default):** sales are recorded as evidence; `qty` is not touched.
2. **Auto-deduct (opt-in, per shop, after a comparison period):** completed sales decrement `qty` via the
   movement ledger, from an explicit **opening baseline + cut-off** so historical sales aren't deducted twice.

The owner moves from 1→2 only via **Comparison Mode** sign-off (below). We never flip an existing shop to
auto-deduct silently.

## Single source of truth for stock movement
- Exactly **one** stream drives deductions per connected till: the provider's **completed-sale** events (or
  the CSV item lines). We **never** also apply a provider's *inventory-change* notifications for the same
  shop (e.g. Zettle Inventory vs Purchases) — that double-counts. Documented per adapter.
- Manual +/- edits, deliveries and stocktakes remain the owner's own movements; the till stream is additive
  and attributed (`source`), never overwriting a newer manual edit (per-item merge already protects this).

## Idempotency & lifecycle (stock safety)
- Each deduction's movement **`operationId` = the sale/line dedupe key** (`provider:merchant:saleId[:lineId]`,
  from `salesModel`). Retries, repeated files, reconnects and overlapping historical windows are therefore
  no-ops (`hasOperation`).
- Deduct **only on a documented COMPLETED sale** — never on a scan, an open order/cart, or a payment attempt.
  `salesModel.isStockEligible` enforces completed + matchable + no blocking issue.
- **Late / re-ordered / updated** transactions: keyed by stable id, so a correction supersedes via a new
  compensating movement (`reverseByBatch`), never a silent overwrite.
- **Refunds ≠ restock:** a refund/return is its own line kind and is only turned into a restock movement when
  the provider marks the item physically returned — a monetary refund alone does nothing to stock.
- **Units:** each/case/multipack/weighted are explicit (`unit`, `packSize`). A case expands by `packSize`;
  weighted lines are flagged for the matcher to confirm the product is sold by weight.
- **Matching:** barcode/SKU/productId only. A **name is advisory and never auto-matched** → unmatched lines
  go to review. Ambiguous qty/unit also goes to review.
- **Opening baseline + cut-off:** enabling a till records `openingStockAt` (= now) and an import cut-off; only
  sales **after** the cut-off deduct. A one-off historical comparison import is marked so it can never later
  be applied as deductions.

## Comparison mode (the safe on-ramp, pilot default)
- Collects/imports sales **without changing stock**. Compares per-product quantities and totals against a
  till report the owner supplies. Highlights missing / duplicate / unmatched records.
- An authorised owner reviews, then explicitly **enables deductions** from a chosen start time. Comparison
  data is tagged so it is **never re-applied** as live deductions.

## Connection methods (framework)
- **A. Cloud** — provider OAuth/credentials server-side; webhooks (verified) or scheduled polling; durable
  processing with retries + reconciliation + missed-data recovery; runs **without the PWA open** (backend).
- **B. File feed** — only via a provider's supported export/delivery. We do **not** claim the PWA reads
  arbitrary files/folders. A desktop connector, if ever needed, is a separate scoped project — it does not
  exist.
- **C. Manual item-level CSV** — the pilot/fallback (reuse + extend `salesImportStore`): preview, column
  mapping, validation, unmatched review, **preserve barcode leading zeros**, duplicate-file + overlapping-
  record detection, show-before-apply, and **reject totals-only reports** for item-level deductions.

## Security
- Provider secrets + refresh tokens: **server-side only, encrypted** via the project's secret approach; never
  in frontend bundles, browser storage, logs or exports. Verify provider webhooks by their documented
  mechanism. Request **minimum / read-only** scopes. Handle token expiry/revocation/disconnect. Shop isolation
  + roles enforced **server-side** (owner/manager enable deductions; staff cannot). Avoid customer PII; never
  collect card data.

## Build slices (small, reviewable)
1. ✅ **Foundation (done):** provider registry, shared sales model, adapter interface + 9 honest adapters,
   matrix + enquiries + this doc, tests. No stock mutation.
2. ✅ **Read-only providers catalogue endpoint + "Connect your till" setup screen** (done) — `GET /api/pwa-pos/providers`
   (`routes/pwaPosRoutes.js`, PWA-token gated, secret-free) + `components/till/TillConnectView.jsx` via
   `lib/posClient.js`. Honest statuses; cloud rows non-tappable; CSV is the only live CTA, routed to the
   unchanged `SalesImportView`. See [[2026-10-21-pos-connect-till-ui]].
3. ✅ **Comparison mode + deducting CSV path** (done) — `compareImport` (pure), `posSettingsStore` (per-shop
   opt-in, default OFF, owner/manager only), `deductImportedSales`/`restoreImportedSales` (idempotent via
   operationId, cap at stock-on-hand, movements-first), `applyImport({deduct,cutoff})` with opening-baseline
   filtering + totals-only refusal, and the `SalesImportView` comparison table + opt-in UI. Returns never
   restock. See [[2026-10-21-pos-comparison-deduct]].
4. ✅ **Backend cloud scaffolding** (done, inert) — `config.posCloud` (default OFF), `utils/secretBox`
   (encrypted tokens at rest), `PosConnection` + `PosSaleEvent` (idempotent durable queue), `posCloudService`
   (gating + honest `POS_NOT_AVAILABLE`, delegates every live call to the adapters which throw until verified),
   connect/callback routes + a signature-authenticated webhook receiver. Nothing accredited/credentialed, so
   all live paths say "not available yet"; not deploy-enabled. See [[2026-10-21-pos-cloud-scaffolding]].
5. ✅ **Status/recovery screens + expanded tests** (done) — `TillConnectView` reads the real `/connections`
   endpoint and shows each till's actual connection status + a Reconnect affordance (honest while inert); new
   adapter contract suite proves all 9 adapters refuse every live op and match the registry. Pilot feedback
   capture deferred until a real collection channel exists (no fabricated telemetry). See
   [[2026-10-21-pos-connection-status]].

> Nothing in slices 3–5 ships enabled without the owner's explicit, per-shop opt-in after a comparison period.
