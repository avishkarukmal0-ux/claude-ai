# 2026-10-15 — UX pass 5 (count, waste, team, stock history)

Canonical line (`ebd54ca`…). Five fixes.

## 1) 44px tap targets + labels
- **Count** (`stocktake/StocktakeView.jsx`): Cancel, product search, counted-qty input, "matches expected"
  button (h-9→h-11) and the review "Reason" input are all ≥44px now; search got an aria-label.
- **Waste** (`waste/WasteView.jsx`): the £ field placeholder was "value" → now "0.00" with `aria-label="Cost in
  pounds"`; Qty got `aria-label="Quantity"`; the "Undo — restores stock" button is 44×44 (was 24). (The £/Qty
  rows were already 44px label boxes.)
- **From the team** (`worker/SuggestionsInbox.jsx`): "Mark done" (28px circle) is now a 44×44 button wrapping
  the small circle; "Remove" is 44×44.

## 2) Stock history balance line
- The per-row running balance was ledger-only (sum of deltas), so after a count it could show −2 while "In
  stock now" was 3. `movementHistory` now takes an `opening` (the reconcile `difference` = pre-tracking stock)
  and starts the balance there, so the **newest row's balance equals "In stock now"**. Test added.

## 3) Negative counts
- Count screen rejects a negative counted quantity (keeps the prior count) and shows an inline
  `role="alert"` "· counts can't be negative" + red border; the input is `aria-invalid`.

## 4) Staff view double-flag
- `worker/WorkerBoard.jsx`: after flagging a product (Mark down / Stock this), the button becomes a disabled
  "Flagged ✓" chip (tracked per kind+product), so the same flag can't be sent twice.

## 5) Waste quick-log hint
- Already present: the quick-log paragraph states it's for items not in the catalogue and "doesn't change stock
  levels" (directly under Binned it / Saved it). Left as-is.

## Verify
- `npm run build` ✓. Full vitest **547 passed / 80 files** (+1 new movementHistory case). SW v55→v56.
