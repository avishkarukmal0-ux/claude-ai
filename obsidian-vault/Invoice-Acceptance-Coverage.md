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
| C1 | Validate file type | client `validateInvoiceFile` + server `validateDataUrl` (image/* or pdf) (`invoiceStore.js`, `invoiceOcrService.js`) | ✅ (P2) | — | `invoiceOcr.test.js`/`invoice-upload.test.js`: non-image/pdf rejected (422 / {ok:false}) |
| C2 | Validate file size | client `MAX_UPLOAD_BYTES`=8MB + server `MAX_BYTES`=8MB + 10mb body wall | ✅ (P2) | — | oversize rejected server + client; tests assert |
| C3 | Restrict access to documents | files local-only, never leave device except the transient OCR send (over TLS to the configured provider only) | ✅ (P2) | — | documented in retention policy below |
| C4 | Retention / deletion defined | `removeInvoice` deletes file; new `deleteFile` deletes the scan but keeps the record (`invoiceStore.js`) + "Delete file" control (`InvoiceCaptureView.jsx`) | ✅ (P2) | — | policy documented below; `deleteFile` leaves the invoice record |
| C5 | OCR text never becomes instructions / triggers tools | OCR = OCR.space (non-LLM); returns raw text; shown React-escaped; validated-first; never fed to a model/tool | ✅ (P2) | — | `invoice-upload.test.js`: hostile line text stored verbatim as data, no effect |
| C6 | Human review before data changes records | nothing auto-commits; explicit Commit (`invoiceStore.commitInvoice`) | ✅ (P2) | — | `invoice-upload.test.js`: saved draft stays draft until explicit commit |

### Document retention & OCR safety policy (C3/C4/C5)
- **Where documents live:** the raw invoice photo/PDF is stored **on the device only**, in the workspace-
  scoped `invoice_files_v1` key. It is **never synced** (not in `STORE_NAMES`) and **never** included in a
  backup. It leaves the device only as a one-shot HTTPS request to the configured OCR provider, and only if
  the owner uploads an image while OCR is switched on.
- **Retention / deletion:** a stored file is removed when its invoice is deleted (`removeInvoice`), or on
  demand via **Delete file** (`deleteFile`) which keeps the checked invoice record for price history/claims.
  Because files are device-local, uninstalling the PWA / clearing site data also removes them.
- **OCR safety:** the provider is a plain OCR engine (not an LLM). Returned text is treated strictly as
  **data** — displayed for the owner to read, never fed to a model and never used to trigger a tool, message
  or financial action. Uploads are type/size validated before anything touches them. **Extracted or typed
  invoice data only affects stock or money after an explicit human review + Commit.**

## D. End-to-end scenarios (P3)

| # | Scenario | Plan | Status |
|---|---|---|---|
| D1 | Correct invoice + complete delivery | reconcile → 0 claimable | ✅ `scenarios.test.js` |
| D2 | Shortage → partial supplier credit | reconcile shortage → claim → approve (received null) → partial `applyCredit` → received 6, outstanding 4 | ✅ `scenarios.test.js` |
| D3 | Wrong price + case/unit conversion | cases invoice vs units delivery → overcharge £4.80 on 24 normalised units | ✅ `scenarios.test.js` |
| D4 | Duplicate invoice / credit-note upload | `findDuplicate` (invoice) + `findDuplicate` (credit note) both detect | ✅ `scenarios.test.js` |
| D5 | Interrupted save → retry | retry with same id → single record; `operationId` guard → one movement | ✅ `scenarios.test.js` |
| D6 | Conflicting edits two devices | real sync engine + fake server: newer mtime wins, stale device adopts server copy (also `sync.test.js` + `pwaSync.integration`) | ✅ `scenarios.test.js` |
| D7 | Staff attempts owner-only action | `canSeeScreen` staff→false for money/claims/staff-admin; backend 403/404/reject in integration suites | ✅ `scenarios.test.js` + integration |
| D8 | Unclear invoice → manual correction | `parseInvoiceText` flags uncertain → owner corrects → draft → explicit commit | ✅ `scenarios.test.js` |

## E. Cross-cutting (P3)

| # | Requirement | Plan | Status |
|---|---|---|---|
| E1 | Fixtures to evaluate extraction quality | `lib/parseInvoiceText.js` (pure, human-review gated) + 3 anonymised fixtures + `extraction-quality.test.js` harness. **Observed:** cash-carry 4/4, itemised 3/3, messy-ocr 3/3 key items detected; no invented % | ✅ |
| E2 | Feature flags for major new workflows | `lib/features.js` → `VITE_INVOICES_ENABLED` (default on), gates invoice/credit/price-history tiles + screens in `HomePage` | ✅ |
| E3 | Config / migration / safe-disable / recovery docs | [[Deployment-Config]] — flag table, additive/lazy migrations, safe disablement (data retained), recovery steps, operator verify commands | ✅ |

### Observed extraction quality (E1 — measured, not invented)
Run `npx vitest run src/lib/__tests__/extraction-quality.test.js`. On the current anonymised fixtures the
heuristic pre-fill detected: **cash-carry 4/4**, **itemised 3/3**, **messy-ocr 3/3** key items, rows parsed
matching the hand-labelled product-row counts. This is a convenience pre-fill only — every line is flagged
`uncertain` and requires human review + commit; real-world OCR quality varies and is not claimed as a %.

---

### Phase gate status
- **Phase 0** — ✅ **passed** (A1–A8 done/verified). FE 205/205, BE pure 22/22, build clean.
- **Phase 1** — ✅ **passed** (B1–B5). FE `isolation.test.js` 3/3; BE `pwaIsolation.integration` 7 (DB-gated, run on the founder's Mongo). FE 208/208, build clean.
- **Phase 2** — ✅ **passed** (C1–C6). BE `invoiceOcr.test.js` 8/8; FE `invoice-upload.test.js` 4; retention/OCR-safety policy documented. FE 212/212, build clean.
- **Phase 3** — ✅ **passed** (D1–D8, E1–E3). `scenarios.test.js` 9, `extraction-quality.test.js` 4, feature flag + docs. FE 225/225, BE pure 30/30, build clean.

**All phases complete.** Every acceptance requirement is ✅ with test/doc evidence above. DB-gated integration
suites (auth/roles, sync role-access, notify, cross-tenant isolation) run on `VENDORA_TEST_URI`.
