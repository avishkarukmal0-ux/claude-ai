# 2026-10-01 — Scan→product, part 1: model + categories + pack/case

Back to [[Work-Log]] · Related: [[Domains/Inventory]] (if present) · next: [[2026-10-01-Scan-Identify]]

## Why
Founder tested camera scanning on the phone — reads fast, but a scan only gives a *number*. They want a
scan to (1) identify the product, (2) tell a single from a whole case, (3) carry a category. None of that
is in the barcode — it must live in the product record. This part adds that record structure + the Stock
UI; part 2 adds the scan-to-identify flow and case booking-in.

## Decision (explained to founder)
- **Identification = the shop's own catalogue, not an external DB.** External GTIN lookups (Open Food
  Facts etc.) miss too much of the c-store mix (tobacco, news, alcohol, vape, local lines); a scanner that
  works for one item and blanks the next loses trust. Local-first = teach once, instant & correct forever,
  offline. External autofill is a possible *later* accelerator for setup only.
- **Case vs single = pack size + optional case barcode + prompt fallback.** Deliveries arrive as cases, so
  scanning the outer case barcode to book a full case (×packSize) is the big time-saver; a prompt covers
  items without a distinct case barcode. (Part 2.)

## Changes (all frontend, local-first)
- `lib/inventoryStore.js`: product model gains `category`, `packSize` (units/case, null = singles only),
  `caseBarcode`. New `normalisePackSize()` (whole number ≥2 else null) and `matchBarcode(products, code)`
  → `{ product, unit:'single'|'case', multiplier }` (prefers single barcode, falls back to case barcode).
  Hook exposes `matchByBarcode`; existing `findByBarcode` kept for delivery receiving.
- `config/categories.js` (new): c-store category presets per shop family + `categoriesInUse()` +
  `categoriesForFamily()`. Field stays free-text.
- `components/inventory/InventoryView.jsx`: Stock list now **grouped by category** (Uncategorised sinks to
  bottom); each row shows a "Case of N" badge when packSize set; search also matches category + case
  barcode; Add form gains a category field (datalist of suggestions) and a collapsible "comes in a case?"
  section (units per case + case barcode).

## Verification
Inventory suite 12/12 (+5: normalisePackSize, matchBarcode single/case/unknown/fallback). FE full
**126/126**. Build clean. Backward-compatible: existing products have the new fields as null and render
under "Uncategorised".

## Commit
`feat(pwa): product category + pack/case fields + barcode match + grouped Stock (scan foundation)`
