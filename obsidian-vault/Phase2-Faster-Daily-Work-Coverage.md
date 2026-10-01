# Phase 2 — Faster Daily Work: Coverage Checklist

Back to [[Home]] · [[Work-Log/Work-Log]] · [[Phase1-Reliability-Security-Coverage]] · [[Deployment-Config]]

Living map of the **Phase 2 mandate** → existing implementation (file:line evidence) → change → acceptance.
Status: ✅ done · 🟡 partial/gap · 🔲 to build · ⏳ in progress. Paths under `vendora-pos/`. Verified against
the actual code (four read-only audits, 2026-10-02). Harden-and-close-gaps: much already exists — reuse it,
no parallel screens, no mock data presented as complete.

---

## 2.5 Daily action screen

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 2.5a | Prioritised action list from attention tools | `actionEngine.buildActions` (severity sort, cap 5) + `TodayActions.jsx` | ✅ | — | — |
| 2.5b | Include expiring stock, overdue claims, urgent tasks, **unfinished deliveries** | expiry/claims/tasks present; now a draft-delivery signal (`actionEngine.js` `delivery-draft`, surfaces drafts with lines → `go:{screen:'receive'}`; `TodayActions` passes `useDeliveries`) | ✅ (2.5) | — | **done** — `actionengine.test.js` (draft with lines surfaced; empty/received ignored; count) |
| 2.5c | Deep-link each action | `go:{screen|tab}` → `HomePage.go` | ✅ | — | — |
| 2.5d | Show why (reason) | `detail` + `money` per action | ✅ | — | — |
| 2.5e | Completion + snoozing | per-day non-destructive snooze (`TodayActions.js`); completion is condition-derived | ✅ | — | snooze hides for the day, returns if still true |
| 2.5f | Avoid duplicate alerts / stale data | `fastOutIds` dedupe; live `useMemo` recompute | ✅ | keep draft signal deduped | — |

## 2.6 Faster onboarding

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 2.6a | One useful action without a full catalogue | guest workspace usable instantly (`NichePicker`→`/home`); waste quick-log is zero-catalogue but not surfaced first-run | 🟡→ | a first-run "quick win" card (try a delivery / expiry check / load demo) for an empty shop | empty shop sees a guided first action |
| 2.6b | Reuse guest/account workflow | `LOCAL_WORKSPACE` guest + explicit `migrateGuestIntoShop` | ✅ | — | — |
| 2.6c | Demo data clearly separated from real | **MISSING** — no demo seed; `ImportView` "Try sample" writes unflagged into real guest data | 🔲→ | a dedicated `demo` workspace loaded/cleared on demand, visibly labelled, never mixed with real data | load demo → isolated; clear demo → gone; real data untouched (test) |
| 2.6d | Contextual PWA install guidance | **MISSING** — no `beforeinstallprompt`/A2HS UI (manifest fine) | 🔲→ | capture `beforeinstallprompt` + an Install card; iOS Safari A2HS instructions | install prompt offered where supported; iOS gets instructions |
| 2.6e | Explain camera & notification permissions | notifications explained before prompt ✅; camera prompts with no primer | 🟡→ | a one-line camera primer before `getUserMedia` | scanner explains why before asking |
| 2.6f | Preserve progress through interruptions + account creation | shop type persisted instantly; local-first durability; migration on sign-up | ✅ | — | — |

## 2.7 Product & pack matching

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 2.7a | Multiple barcodes per product | now `extraBarcodes[]` on the product; `matchBarcode`/`findByBarcode` resolve them; `codesOf`/`productByAnyCode`; hook `addBarcode`/`removeBarcode` (clash-guarded); EditForm "Other barcodes" editor (`inventoryStore.js`, `InventoryView.jsx`) | ✅ (2.7) | — | **done** — `product-matching.test.js`: extra barcode resolves; clash refused |
| 2.7b | Supplier-specific aliases | now `supplierAliases[{supplierId,code,name}]` on the product; `matchBySupplierAlias` (supplier-scoped); wired into `invoiceStore.matchLines`; EditForm "Supplier names/codes" editor | ✅ (2.7) | — | **done** — `product-matching.test.js`: alias matches by code/name + via matchLines |
| 2.7c | Case sizes & loose units explicit | `packSize`/`caseBarcode`; `matchBarcode` single/case; delivery `qtyMode` | ✅ | — | (one case tier only — documented) |
| 2.7d | Normalise units before comparing qty & cost | `deliveryStore`/`invoiceStore` normalisers; `reconcile` compares normalised | ✅ | — | — |
| 2.7e | Reviewable duplicate-product merge | now `findDuplicateProducts` (shared barcode / same name) + `mergeProducts(keepId,dropId)` (unions barcodes/aliases, sums stock+batches, fills blanks); `MergeView` review screen + an amber badge in the Stock header | ✅ (2.7) | — | **done** — `product-matching.test.js`: detect + merge; never automatic (confirm) |
| 2.7f | Preserve historical refs on merge | `productMerge.reassignProductRefs` re-points `productId` across movements, price alerts, claim items, invoice + delivery lines before the duplicate is dropped; fires a workspace event so hooks re-read | ✅ (2.7) | — | **done** — `product-matching.test.js`: the dup's movement is re-pointed to the kept product |
| 2.7g | Confirm ambiguous matches; never invent pack sizes | unknown→manual add; `normalisePackSize` needs explicit ≥2; online lookup fills name/category only | ✅ | — | — |

## 2.8 Stock confidence & quick counts

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 2.8a | Show when last physically counted | now shown on the main Inventory row ("counted {date}" / "not counted") via `p.countedAt` (`InventoryView.jsx`), as well as StocktakeView | ✅ (2.8) | — | **done** |
| 2.8b | Distinguish recorded/estimated vs verified | `stockStatus` counted/calculated; velocity sales/estimated; now visible on the row | ✅ | — | — |
| 2.8c | Quick counts by shelf or category | now a category chip filter scopes the count list in StocktakeView (`cat` state, `CatChip`); shelf isn't a named product field so category is the scope | ✅ (2.8) | — | **done** — count one category at a time |
| 2.8d | Explain expected vs counted differences | `buildSummary` variance + £ shrinkage/overage; `reconcileQty` | ✅ | — | — |
| 2.8e | Require a reason for material adjustments | `isMaterialVariance` (≥£10 at cost OR ≥5 units) flags lines; `buildSummary.materialWithoutReason` gates apply; StocktakeView blocks apply + flags the inputs (`MATERIAL_VALUE`/`MATERIAL_UNITS`) | ✅ (2.8) | — | **done** — `stocktake.test.js`: a big variance can't apply without a reason |
| 2.8f | Reuse existing stock-count; no parallel flow | StocktakeView is the one flow; the dead `setCounts` now routes through `applyCounts` (snapshot-safe, sets `countedAt`) — the unsafe blind-overwrite path is gone | ✅ (2.8) | — | **done** — `inventory.test.js` setCounts still logs a stock_adjustment |
| 2.8g | Don't claim accurate live stock when movements missing | `salesConnected:false`, honest `velocity` null, `reconcileQty` | ✅ | — | — |

---

## Acceptance scenarios (Phase 2)
| Scenario | Plan | Status |
|---|---|---|
| A product has different unit and case barcodes | case/single `matchBarcode` + `extraBarcodes` all resolve to the one product | ✅ (2.7) — `product-matching.test.js` |
| (reliability/mobile scenarios live in Phase 1 / Phase 3 checklists) | — | — |

## Feature flags & disablement
- No new always-on workflows that need a kill switch beyond existing patterns; demo data is user-initiated and
  isolated in a `demo` workspace (load/clear). Any notable flag added here will be listed in [[Deployment-Config]].

## Phase gate status
- ⏳ **In progress.** Delivered as reviewable commits per area (2.5 → 2.8 → 2.7 → 2.6), each with tests; this
  checklist updated as each lands.
</content>
