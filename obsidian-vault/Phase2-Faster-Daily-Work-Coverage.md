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
| 2.7a | Multiple barcodes per product | only `barcode` + `caseBarcode` (`inventoryStore.js`) | 🔲→ | `extraBarcodes[]` on the product; `matchBarcode` checks them; edit UI to add/remove; "link this scan to an existing product" | a 2nd barcode resolves to the product (test) |
| 2.7b | Supplier-specific aliases | **MISSING** — supplier model has no product mapping; reconcile matches by name per-document | 🔲→ | per-product `supplierAliases[{supplierId,code,name}]`; reconcile uses them; capture on manual match | an invoice line matches via a stored supplier alias (test) |
| 2.7c | Case sizes & loose units explicit | `packSize`/`caseBarcode`; `matchBarcode` single/case; delivery `qtyMode` | ✅ | — | (one case tier only — documented) |
| 2.7d | Normalise units before comparing qty & cost | `deliveryStore`/`invoiceStore` normalisers; `reconcile` compares normalised | ✅ | — | — |
| 2.7e | Reviewable duplicate-product merge | **MISSING** — no detection, no merge | 🔲→ | duplicate detection (same barcode / fuzzy name) + a reviewable `mergeProducts(keepId,dropId)` | merge combines two products behind a confirm (test) |
| 2.7f | Preserve historical refs on merge | all history keyed by `productId`; `removeProduct` is a hard delete | 🔲→ | merge remaps `productId` across movements/claims/invoices before dropping | after merge, the kept product owns the merged history (test) |
| 2.7g | Confirm ambiguous matches; never invent pack sizes | unknown→manual add; `normalisePackSize` needs explicit ≥2; online lookup fills name/category only | ✅ | — | — |

## 2.8 Stock confidence & quick counts

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 2.8a | Show when last physically counted | `countedAt` + `stockStatus` shown only in StocktakeView | 🟡→ | show "counted/recorded" + last-counted on the main Inventory row | stock list shows count confidence |
| 2.8b | Distinguish recorded/estimated vs verified | `stockStatus` counted/calculated; velocity sales/estimated | ✅ | surface on the row (with 2.8a) | — |
| 2.8c | Quick counts by shelf or category | **MISSING** — StocktakeView only free-text search | 🔲→ | a category (and shelf, where tracked) filter in StocktakeView | count a single category subset (test on the filter) |
| 2.8d | Explain expected vs counted differences | `buildSummary` variance + £ shrinkage/overage; `reconcileQty` | ✅ | — | — |
| 2.8e | Require a reason for material adjustments | reason plumbed but **optional**, no threshold | 🟡→ | require a reason when a count variance (or manual edit) is material (by value/units) | a large variance can't apply without a reason (test) |
| 2.8f | Reuse existing stock-count; no parallel flow | StocktakeView is the one flow; `setCounts` is a dead, unsafe legacy mutator | 🟡→ | remove/neutralise `setCounts` (bypasses `countedAt`/snapshot-safety) | no unsafe count path remains |
| 2.8g | Don't claim accurate live stock when movements missing | `salesConnected:false`, honest `velocity` null, `reconcileQty` | ✅ | — | — |

---

## Acceptance scenarios (Phase 2)
| Scenario | Plan | Status |
|---|---|---|
| A product has different unit and case barcodes | existing case/single `matchBarcode` + new `extraBarcodes` | ⏳ (2.7) |
| (reliability/mobile scenarios live in Phase 1 / Phase 3 checklists) | — | — |

## Feature flags & disablement
- No new always-on workflows that need a kill switch beyond existing patterns; demo data is user-initiated and
  isolated in a `demo` workspace (load/clear). Any notable flag added here will be listed in [[Deployment-Config]].

## Phase gate status
- ⏳ **In progress.** Delivered as reviewable commits per area (2.5 → 2.8 → 2.7 → 2.6), each with tests; this
  checklist updated as each lands.
</content>
