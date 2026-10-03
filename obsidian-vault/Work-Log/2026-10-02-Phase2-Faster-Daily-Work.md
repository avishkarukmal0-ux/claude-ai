# 2026-10-02 — Phase 2: Faster daily work

Back to [[Work-Log]] · Checklist: [[Phase2-Faster-Daily-Work-Coverage]] · follows [[2026-10-02-Phase1-Reliability-Security]]

Second mandate phase (PWA-only). Same method: four read-only audits first (daily actions, onboarding,
product/pack matching, stock confidence), then close the *verified* gaps — most machinery already existed.
Full requirement→evidence map in [[Phase2-Faster-Daily-Work-Coverage]]. Delivered as reviewable per-area
commits, each with tests.

## 2.5 — Daily action screen ✅ (`d783ee7`)
Already strong (prioritised, deep-linked, reasons, per-day non-destructive snooze). Gap: unfinished (draft)
deliveries weren't surfaced. `buildActions` now emits a `delivery-draft` warn action for drafts that have
lines (empty/received ignored), deep-linking to receive; `TodayActions` feeds it via `useDeliveries`.

## 2.8 — Stock confidence & quick counts ✅ (`48c0de4`)
- Last-counted confidence now on the main Inventory row ("counted {date}" / "not counted").
- Quick counts by **category** (chip filter in StocktakeView) — count one section at a time.
- **Reason required for material adjustments**: `isMaterialVariance` (≥£10 at cost OR ≥5 units) +
  `buildSummary.materialWithoutReason` gate the apply step; small miscounts aren't nagged.
- Removed the unsafe parallel count path: dead `setCounts` now routes through `applyCounts` (snapshot-safe,
  sets `countedAt`).

## 2.7 — Product & pack matching ✅ (`57bab8e`)
- **Multiple barcodes** per product (`extraBarcodes[]`, `matchBarcode`/`findByBarcode`, `addBarcode`
  clash-guarded, EditForm editor).
- **Supplier aliases** (`supplierAliases[]`, `matchBySupplierAlias`, wired into `invoiceStore.matchLines`,
  EditForm editor).
- **Duplicate detect + merge**: `findDuplicateProducts` + `mergeProducts` (unions barcodes/aliases, sums
  stock+batches) + `MergeView` review screen + an amber badge in the Stock header; **never automatic**.
- **History preserved on merge**: `productMerge.reassignProductRefs` re-points `productId` across movements,
  price alerts, claim items, invoice + delivery lines before the duplicate is dropped.

## 2.6 — Faster onboarding ✅ (this commit)
- **First-run quick-win card** (empty shop): receive a delivery / record a waste-expiry check / explore
  sample data — none needs a catalogue first.
- **Isolated demo data** (`demo.js`): `loadDemo`/`exitDemo` seed + purge a dedicated `demo` workspace, never
  mixed with real data; an amber "Demo data" banner + Exit in HomePage.
- **PWA install guidance** (`install.js` + `InstallCard`): real Install where supported, iOS Safari A2HS
  steps otherwise; dismissible, hidden when standalone.
- **Camera primer**: first-use explanation ("only reads barcodes — never records/uploads") before the
  camera permission prompt.

## Verification
FE **259/259** (vitest); build clean. No backend changes in Phase 2. Acceptance scenario "product with
different unit & case barcodes" covered by `product-matching.test.js`.

## Follow-ups
Phase 3 (mobile quality & operational monitoring) is the remaining mandate phase.
</content>
