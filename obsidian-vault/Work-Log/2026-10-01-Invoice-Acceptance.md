# 2026-10-01 — Invoice reconciliation & credit: acceptance hardening

Back to [[Work-Log]] · Checklist: [[Invoice-Acceptance-Coverage]] · routes [[Backend/API-Routes]]

A formal acceptance mandate for the invoice reconciliation + credit system (built across the earlier P0–P3
work). Delivered phase-by-phase; each phase gated on its checks passing. Full requirement→evidence map lives
in [[Invoice-Acceptance-Coverage]] (kept current as phases land).

## Phase 0 — coverage checklist + reconciliation/credit foundations ✅
- **Coverage checklist** created first (evidence-based, file:line), mapping every requirement → existing
  impl → change → acceptance. Statuses updated as work lands.
- **Decimal-safe money** — new `frontend/src/lib/money.js` + `backend/src/utils/money.js`: integer-pence
  arithmetic, **rounding half away from zero** to the penny (documented policy), `toPence/fromPence/round2/
  sumMoney/mul/money`. Replaced the duplicated ad-hoc `r2` in reconcile/claim/creditNote/invoice and the
  backend digest. Fixes float drift (0.1+0.2, 2.675, many-line sums).
- **Source references (A1/A2)** — `reconcile` now stamps `invoiceId/invoiceRef/deliveryId/invoiceLineId/
  deliveryLineId` + the calc `detail` on every discrepancy; `discrepanciesToClaimItems` + `createClaim`
  carry them onto the claim + items. `InvoiceCaptureView` passes the invoice refs.
- **Reversals/history (A4)** — credit-note void reverses its claim allocations (already wired in
  `CreditNotesView`) and `removeNote` now returns `{note, claimIds}`; received recomputed via `sumMoney`.
- **Credit-note dedupe (A8)** — `creditNoteFingerprint`/`findDuplicateCreditNote` + a save-time confirm,
  matching the invoice dedupe.
- **approval ≠ receipt (A7)** and **dup stock movements (A5)** / **dup credit allocations (A6)** verified
  already satisfied (evidence in the checklist).

### Verification (Phase 0 gate)
FE **205/205** (+10: money 7, reconcile refs, credit-note dedupe, createClaim refs/total). BE pure
**22/22** (money 5 added). Build clean; backend loads. Gate passed → Phase 1.

## Phase 1 — shop isolation + unauthorised-access tests ✅
- FE `lib/__tests__/isolation.test.js` (3): `invoice_files_v1` is local-only (∉ `STORE_NAMES`); a file saved
  in shop A is invisible from shop B; credit notes are per-workspace.
- BE `__tests__/pwaIsolation.integration.test.js` (7, DB-gated): B can't read A's sync blobs; sync/OCR/notify
  reject missing tokens (401); owner A's PATCH/DELETE of shop B's staff member → 404 (token-scoped); A's
  notify prefs change doesn't touch B; A's digest preview shows A's overdue claim while B's shows 0
  (background-job isolation).
- Verification: FE **208/208** (+3), build clean; BE isolation suite parses + skips offline, runs on the
  founder's Mongo via `VENDORA_TEST_URI` (same pattern as the 9/9-verified sync/auth suites).

## Phase 2 — untrusted upload / OCR hardening ✅
- **Validation:** server `invoiceOcrService.validateDataUrl` (image/* or PDF, ≤8 MB decoded, base64 required)
  runs BEFORE anything touches the upload — even when OCR is off; client `validateInvoiceFile` mirrors it
  (type + 8 MB). Express body wall stays 10 mb.
- **Retention/deletion:** files are device-only (workspace-scoped `invoice_files_v1`, never synced, never
  backed up). New `deleteFile` + a "Delete file" control purges the scan while keeping the invoice record;
  `removeInvoice` deletes both. Policy documented in [[Invoice-Acceptance-Coverage]].
- **OCR safety:** OCR.space is a plain OCR engine (not an LLM); returned text is DATA — React-escaped on
  display, never fed to a model or used to trigger tools/messages/financial actions. Extracted/typed data
  only affects stock or money after an explicit human **Commit**.
- Verification: BE `invoiceOcr.test.js` **8/8** (type/size/base64/empty reject; unconfigured returns
  `{configured:false}` with no fabricated fields; validation throws before use). FE `invoice-upload.test.js`
  **4** (type/size validation; hostile line text stored verbatim; draft→commit gate). FE **212/212**, build
  clean, backend loads.

## Phase 3 (pending)
8 end-to-end scenarios, anonymised fixtures + `parseInvoiceText` extraction harness (observed results),
feature flags, config/migration/safe-disable/recovery docs.

## Commit
`feat(pwa): decimal-safe money + source refs + credit-note dedupe (acceptance P0)`
