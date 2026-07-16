# 2026-07-15 — Wire up the POS Refund button

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[POS-and-Checkout]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
User: "we have add a refund option into this." The `↩ Refund` button existed in the POS cart action row but its `action` was a no-op stub (`() => {}`), so tapping it did nothing. Make refunds actually work.

## Findings (already existed)
- Backend fully built: `refundService.processRefund` + `POST /sales/:id/refund` (`requirePermission('canRefund')`), `Refund` model, stock restore, drawer update, `REF-…` receipt, sale status → `refunded`/`partially_refunded`.
- Frontend service `salesSvc.refundSale(id, data)` already present.
- The ONLY gap was the dead button in `POSPage.jsx`.

## Changes
- `frontend/src/pages/POSPage.jsx`:
  - Added `RefundModal` component — 3 steps: (1) look up sale by receipt number via `salesSvc.getByReceipt`, (2) tick items + adjust quantities, choose refund method (original/cash/card) + reason, (3) success screen with refund receipt number. Blocks refunding voided/already-refunded sales.
  - Added `showRefund` state; wired `↩ Refund` button `action: () => setShowRefund(true)`; rendered `<RefundModal>` alongside the other modals.
- `obsidian-vault/Domains/POS-and-Checkout.md` — documented the refund flow under Capabilities.

## Decisions
- Put the refund UI behind the existing POS button (most discoverable) rather than only in Transaction History.
- Payload sends both `barcode` and `productId` per item so `refundService`'s `barcode || productId` match always resolves.
- Didn't collect an `authorisedPin` — backend currently treats the logged-in user as both processor and authoriser; permission is enforced server-side by `canRefund`.

## Gotchas
- If the logged-in role lacks `canRefund`, the backend returns 403 → modal shows the error toast. Expected.
- Receipt number format is `YYYYMMDD-NNNN` (from `generateReceiptNumber`).

## Verification
- `npm run build` (frontend) ✅ passes (pre-existing `api.js` dynamic-import warning only).

## Commit(s)
- _(to be filled after push)_

## Follow-ups
- [ ] Optionally add the same "Refund" entry point on `TransactionHistoryPage` rows for staff who start from history.
- [ ] Manual end-to-end test once running locally: make a sale → refund part of it → confirm stock + drawer + P&L.
