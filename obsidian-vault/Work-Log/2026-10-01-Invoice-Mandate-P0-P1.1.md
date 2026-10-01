# 2026-10-01 — Invoice mandate: Phase 0 + Phase 1.1 (invoice capture)

Back to [[Work-Log]] · Related: [[Backend/API-Routes]] · [[2026-10-01-Audit2-Response]] (Phase 0 foundations)

Multi-phase mandate: delivery → discrepancy → claim → confirmed credit, PWA-only (no till). Verified every
Phase 0 claim against code first; preserved work (clean tree). Executing in priority order.

## Phase 0 — foundations
Most of Phase 0 was already delivered in this session's audit response and verified here:
- Silent persistence failures → guarded (`persist()` checked in stock mutators, audit W1).
- Unsafe offline/cloud sync, duplicates, conflicts, interrupted recovery → sync identity guard, in-flight
  merge, atomic server CAS, failed-write surfaced, tombstones, atomic `recordMany` (audit P1/P2 + W10).
- Wrong-price claims → claim the overcharge, not full cost (audit W8).
- `outcomes.js` already sums only confirmed `receivedAmount` for recovered money; requested/approved/
  received kept separate.
**New fix this commit:** `claimStore.advance` no longer auto-sets `receivedAmount` when a claim goes
`settled` — money is "received" only when the owner confirms it (the "settled ≠ paid" rule). Updated the
claims test to assert received stays null on settle until explicitly set.

## Phase 1.1 — supplier invoice capture (new, PWA; till invoice code is gated off, not reused)
- `lib/invoiceStore.js`: model + pack/unit normalisation (`lineUnits`/`lineUnitCost`/`lineTotal` — cases×pack
  and case-cost→per-unit), `invoiceFingerprint`/`findDuplicateInvoice` (supplier+ref+date+total),
  `matchLines` (reuses inventory `matchBarcode` then name), `useInvoices` (save draft / commit / remove /
  getFile / findDuplicate). **Metadata in `invoices_v1` (synced); raw files in `invoice_files_v1`
  (on-device only — multi-MB, too big for the sync blob cap).** Added `invoices_v1` to STORE_NAMES + the
  backend sync allowlist (`LOCAL_ONLY_STORE_NAMES` documents the file store).
- OCR **optional, behind config, never faked**: backend `config.invoiceOcr` (`INVOICE_OCR_PROVIDER` +
  `OCR_SPACE_API_KEY`), `services/invoiceOcrService` (real OCR.space path returning RAW TEXT only; reports
  `configured:false` when unset), `routes/pwaInvoiceOcrRoutes` (`/status`, POST), client `lib/invoiceOcr.js`.
  With no provider the review screen is fully manual.
- `components/invoices/InvoiceCaptureView.jsx`: capture photo/PDF or enter manually → **review** screen
  (correct supplier/ref/date/lines, matched/new badges, OCR text shown as an aid, duplicate warning,
  live totals) → Save draft / Commit. Nothing touches stock here. Wired into the Buy hub ("Supplier
  invoices") + `invoices` screen; reuses `useSuppliers` + `useInventory`.

## Verification
FE **154/154** (+7 invoice calc/dedupe/match tests); build clean. Backend boots; unit 56/56. OCR live path
runs only from the deployed backend with a key set (sandbox can't call it) — reports not-configured locally,
so manual review is exercised.

## Required configuration (optional)
- Invoice OCR: set `INVOICE_OCR_PROVIDER=ocrspace` + `OCR_SPACE_API_KEY=<key>` on the backend (Render) to
  enable text extraction. Unset = manual review (works today). Key stays server-side.

## Next
P1.2 reconciliation (delivery↔invoice→claims), then P2 (credit notes + reminders), P3 (staff/notifications/
price history/report).

## Commit
`feat(pwa): invoice capture + OCR-behind-config (P1.1); settled no longer assumes paid (P0)`
