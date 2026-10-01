# 2026-10-01 — Scan→product, part 2: scan-to-identify + case booking-in

Back to [[Work-Log]] · Builds on [[2026-10-01-Scan-Product-Foundation]]

## What
The flow that makes the foundation useful on the shop floor: open the Scan tab → **Scan to identify** →
point the camera (or type) → see exactly what the barcode is and act on it.

## Changes
- `lib/inventoryStore.js`: new `bookIn(id, units)` — increases stock and logs `GOODS_RECEIVED` (reason
  `scan-in`), returning `{ ok, added }`. Used by the scan flow (a case books in units = cases × packSize).
- `components/scan/ScanIdentifyView.jsx` (new):
  - **Idle:** "Open camera" (uses the existing `BarcodeScanner`/`BarcodeDetector`) or type a barcode.
  - **Found — single:** card with name, category chip, price, margin, "case of N" note, and current stock.
    Actions: book in N (stepper), Sell 1, Scan next.
  - **Found — case barcode:** header "Case barcode — N per case"; primary action books in whole cases
    (×packSize), with a singles fallback. (This is the delivery time-saver: one scan of the outer = a case.)
  - **Unknown code:** "Not in your list yet" → quick add (name, category datalist, cost/price/qty, pack
    size, case barcode) prefilled with the scanned code → saved so every future scan identifies it. This is
    the local-first identification loop: teach once, instant thereafter.
- `pages/HomePage.jsx`: Scan hub gets a **"Scan to identify"** tile (first); renders `scan-identify` screen.

## Notes / decisions
- Identification stays local-first (own catalogue) per part 1 — no external GTIN lookup.
- Case handling is "both": a distinct case barcode books a full case with zero typing; otherwise the
  single-scan card still offers a cases stepper (×pack size) as the prompt fallback.
- `bookIn` logs goods-received (not a stock-adjustment), so velocity/valuation stay honest.

## Verification
Store logic (`matchBarcode`, `normalisePackSize`, `bookIn` via the model) covered by inventory unit tests
(12/12). The view needs a camera (jsdom has none), so it's manually verifiable on device — FE full
**126/126**, build clean. Founder to try on the phone: scan a known item (see it identified), scan an
unknown (add once), set a pack size + case barcode and scan the outer (books a full case).

## Commit
`feat(pwa): scan-to-identify screen + book-in (single/case) — scan now resolves to a product`
