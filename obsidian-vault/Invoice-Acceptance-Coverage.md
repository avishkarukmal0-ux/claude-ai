# Invoice Reconciliation & Credit — Acceptance Coverage Checklist

Back to [[Home]] · [[Work-Log/Work-Log]] · routes [[Backend/API-Routes]]

Living map of the acceptance mandate → existing implementation (with evidence) → proposed change →
acceptance criteria. Status: ✅ done · 🟡 partial/gap · 🔲 to build. Updated as phases land.
Paths are under `vendora-pos/`.

## Rounding policy (explicit)
Money is held and entered as pounds. All currency arithmetic goes through `frontend/src/lib/money.js`
(and `backend/src/utils/money.js`): amounts convert to **integer pence**, sums/products are done in pence,
and the result rounds **half away from zero** to the nearest penny at the point a figure is stored or
displayed. Per-unit costs are kept to the penny; line totals = `round2(unitCost × units)`; claim/credit
totals = `sumMoney(parts)`. This avoids binary-float drift across many lines. (Phase 0)

---

## A. Reconciliation & credit requirements

| # | Requirement | Existing evidence | Status | Change (phase) | Acceptance |
|---|---|---|---|---|---|
| A1 | Preserve source-document + source-line references | reconcile emits `invoiceId/invoiceRef/deliveryId/invoiceLineId/deliveryLineId` + `detail` (`reconcile.js:33-39,42-100`); `createClaim` stores `invoiceId/invoiceRef` + items keep line refs (`claimStore.js:103-117`); `InvoiceCaptureView.jsx:251` passes invoice refs | ✅ (P0) | — | **done** — test `reconcile.test.js` asserts refs on every claimable discrepancy + claim item |
| A2 | Show the calculation behind every discrepancy | `detail` string per discrepancy, carried onto claim item (`reconcile.js` + `discrepanciesToClaimItems`) | ✅ (P0) | — | **done** — test asserts non-empty `detail` on claim items |
| A3 | Decimal-safe currency + explicit rounding policy | shared `frontend/src/lib/money.js` + `backend/src/utils/money.js` (integer pence, half-away-from-zero); imported by reconcile/claim/creditNote/invoice + backend digest | ✅ (P0) | — | **done** — `money.test.js` (FE 7 / BE 5) incl. 0.1+0.2, 2.675, 100-line drift |
| A4 | Corrections + reversals retaining history | claim `removeCredit` + history events; `updateClaim/Item`; credit-note void reverses its claim allocations (`CreditNotesView.jsx:55`) + `removeNote` returns `{note,claimIds}` (`creditNoteStore.js`) | ✅ (P0) | — | **done** — void removes credits + recomputes received; history retained |
| A5 | Prevent duplicate stock movements | `hasOperation(operationId)` guard + atomic `recordMany` (`movementStore.js:117-121,93`) | ✅ | scenario test (P3) | re-applying a delivery op writes no second movement |
| A6 | Prevent duplicate credit allocations | `applyCredit` idempotent per note (`claimStore.js:132`); `setAllocation` over-alloc guard (`creditNoteStore.js:93`) | ✅ | — | re-applying same note replaces, never doubles (existing test). Over-receipt intentionally allowed (goodwill credits) |
| A7 | Supplier approval ≠ confirmed receipt | `approvedAmount` vs `receivedAmount`; settle does NOT set received (`claimStore.js:182-185`); received only via `applyCredit` | ✅ | — | test asserts settle leaves received null; receipt only via credit |
| A8 | Duplicate invoice / credit-note upload | invoice `invoiceFingerprint/findDuplicate` + UI warning; **credit-note** `creditNoteFingerprint/findDuplicateCreditNote` + save-time confirm (`creditNoteStore.js`, `CreditNotesView.jsx:34`) | ✅ (P0) | — | **done** — `creditnotes.test.js` asserts credit-note dup detection |

## B. Shop isolation (+ unauthorised-access tests)

| # | Requirement | Existing evidence | Status | Change (phase) | Acceptance |
|---|---|---|---|---|---|
| B1 | API endpoints scoped per shop | sync scoped by token shopId; OCR/notify token-gated | ✅ (P1 tests) | — | `pwaIsolation.integration`: B can't read A's blobs; sync/OCR/notify 401 without token |
| B2 | Uploaded documents isolated | invoice files on-device only, never synced (`invoiceStore.js:12,87-88`; `LOCAL_ONLY_STORE_NAMES`) | ✅ (P1 tests) | — | `isolation.test.js`: `invoice_files_v1` ∉ `STORE_NAMES`; file in shop A invisible in shop B |
| B3 | Background jobs isolated | `runForAccount`/preview use only that account's blobs (`pwaNotifyService.js`) | ✅ (P1 tests) | — | `pwaIsolation.integration`: A's digest preview shows A's claim, B's shows 0 |
| B4 | Notifications isolated | prefs on the account; recipient defaults to owner email | ✅ (P1 tests) | — | `pwaIsolation.integration`: A enabling email leaves B's prefs default; prefs/preview 401 without token |
| B5 | Staff access isolated | ownerGate scopes by `req.pwa.shopId`; role store-gate (`pwaSyncService.js`) | ✅ (P1 tests) | — | `pwaIsolation.integration`: owner A PATCH/DELETE of B's member → 404; (staff financial-store denial in `pwaSync.integration`) |

## C. Untrusted input (uploads / OCR)

| # | Requirement | Existing evidence | Status | Change (phase) | Acceptance |
|---|---|---|---|---|---|
| C1 | Validate file type | client `accept="image/*,application/pdf"` (`InvoiceCaptureView.jsx:96`); server none | 🟡 | server validates dataUrl mime (image/* or pdf); client rejects others (P2) | non-image/pdf upload rejected server-side (422); test asserts |
| C2 | Validate file size | none | 🔲 | cap dataUrl size (server ~8MB, client pre-check) (P2) | oversize upload rejected (422); test asserts |
| C3 | Restrict access to documents | files local-only, never leave device except transient OCR send | ✅ | document (P2) | — |
| C4 | Retention / deletion defined | `removeInvoice` deletes file (`invoiceStore.js:143-148`) | 🟡 | retention policy doc + "delete stored file, keep record" control (P2) | deleting a file leaves the invoice record; policy documented |
| C5 | OCR text never becomes instructions / triggers tools | OCR = OCR.space (non-LLM), returns raw text; shown in `<pre>` (React-escaped) (`invoiceOcrService.js`, `InvoiceCaptureView.jsx:167`); nothing executed | ✅ | document explicitly; test that text is treated as data (P2) | injected "instructions" in OCR text do nothing; documented |
| C6 | Human review before data changes records | nothing auto-commits; explicit Commit (`invoiceStore.js:138`, `InvoiceCaptureView.jsx:73,120`) | ✅ | test asserts extracted data needs commit (P2/P3) | extracted/parsed data never alters stock/financials without commit |

## D. End-to-end scenarios (P3)

| # | Scenario | Plan | Status |
|---|---|---|---|
| D1 | Correct invoice + complete delivery | reconcile → 0 claimable | 🔲 |
| D2 | Shortage → partial supplier credit | reconcile shortage → claim → partial `applyCredit`; received < outstanding | 🔲 |
| D3 | Wrong price + case/unit conversion | invoice cases vs delivery units → overcharge on normalised units | 🔲 |
| D4 | Duplicate invoice / credit-note upload | `findDuplicate*` detects both | 🔲 |
| D5 | Interrupted save → retry | failed `writeJSON` → retry, stable id, no double record/movement | 🔲 |
| D6 | Conflicting edits two devices | sync LWW by mtime (existing `sync.test.js`) + scenario assert | 🟡 |
| D7 | Staff attempts owner-only action | 403 (existing integration) + store-gate | 🟡 |
| D8 | Unclear invoice → manual correction | OCR uncertain → edit → commit | 🔲 |

## E. Cross-cutting (P3)

| # | Requirement | Plan | Status |
|---|---|---|---|
| E1 | Fixtures to evaluate extraction quality | anonymised invoice-text fixtures + `parseInvoiceText` (pure, human-review gated) + harness reporting **observed** counts (no invented %) | 🔲 |
| E2 | Feature flags for major new workflows | `VITE_INVOICES_ENABLED` (default on) gating invoice/reconcile/credit UI, following `ACCOUNTS_ENABLED`/`config.*` patterns | 🔲 |
| E3 | Config / migration / safe-disable / recovery docs | setup doc: env flags, additive migrations (Account.notify default, Member new), disable → hides UI (data retained), recovery = re-enable | 🔲 |

---

### Phase gate status
- **Phase 0** — ✅ **passed** (A1–A8 done/verified). FE 205/205, BE pure 22/22, build clean.
- **Phase 1** — ✅ **passed** (B1–B5). FE `isolation.test.js` 3/3; BE `pwaIsolation.integration` 7 (DB-gated, run on the founder's Mongo). FE 208/208, build clean.
- **Phase 2** — in progress next.
- Phase 3 — pending; starts only after Phase 2's checks pass.
