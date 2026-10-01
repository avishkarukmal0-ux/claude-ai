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

## Phases 1–3 (pending)
1 — shop isolation + unauthorised-access tests. 2 — untrusted upload/OCR hardening. 3 — 8 end-to-end
scenarios, anonymised fixtures + extraction harness, feature flags, config/migration/disable/recovery docs.

## Commit
`feat(pwa): decimal-safe money + source refs + credit-note dedupe (acceptance P0)`
