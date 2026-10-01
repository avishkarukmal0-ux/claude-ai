# 2026-10-01 — Audit follow-through: the three product-decision items (W8, W15, W3)

Back to [[Work-Log]] · Follows [[2026-10-01-Audit2-Backlog]] · founder said "go for all" (my recommended shapes).

These three weren't plain bugs — they needed a product call. Founder approved all three; built here.

## W8 — wrong-price claims ask for the OVERCHARGE, not the full value
- `claimStore.claimItemsFromDelivery`: a `wrong_price` item now starts at **£0** with the billed price
  captured (`unitBilled`, `unitAgreed: null`); missing/damaged still claim full value.
- New `updateClaimItem(claimId, itemId, patch)`: entering the agreed £/unit recomputes
  `amount = max(0, billed − agreed) × qty`.
- `ClaimsView`: wrong-price lines show the billed price + an editable "agreed £/u" field (with a prompt
  until it's filled); the claimed amount updates live. So a £2-vs-£1.80 overcharge on 10 units claims **£2**,
  not £20.

## W15 — customer requests: open → planned → stocked
- `requestStore`: statuses now `open → planned → stocked | declined`. "Add to buy list" sets **planned**
  (not stocked); **stocked** only when the owner confirms it's actually in ("Got it in"). Re-asking a
  planned item pulls it back to **open** and bumps the count (demand preserved, no duplicate).
- `RequestsView`: open → "Add to list" / decline; planned → "On buy list" badge + "Got it in"; terminal →
  label + delete. Strike-through only for terminal.

## W3 — expiry on quick-sell: warn, hard-block use-by
- New batch-aware `inventoryStore.worstExpiry(p)` — most-urgent expiry across the product date AND every
  dated batch.
- `ScanIdentifyView` "Sell 1": a **past use-by** (hard, mustPull) item is **blocked** ("pull from sale");
  a past **best-before** asks for confirmation; otherwise sells. (Chose warn-not-block for best-before, hard
  block for use-by — the founder's "go for all" on my recommendation.)
- Made Home actions (`actionEngine`) and the staff board (`WorkerBoard`) batch-aware too (were checking
  only the product-level date, missing an expired batch).

## Verification
FE **147/147** (+5: planned re-ask + terminal, wrong-price overcharge, worstExpiry batch-aware). Build clean.
Sell-path block + claim editing are UI; verify on device.

## Commit
`feat(pwa): audit product decisions — overcharge claims (W8), request lifecycle (W15), expiry-safe sell (W3)`
