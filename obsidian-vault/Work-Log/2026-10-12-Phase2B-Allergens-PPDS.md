# 2026-10-12 — Phase 2B (part 2): per-product allergens + PPDS wiring

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Phase2B-Fresh-Weighed]]

**Domain(s):** inventory model, Stock add/edit forms, PPDS label tool
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `59310b6`

The Natasha's-Law core — allergen + ingredient data on the product itself, wired into the PPDS tool. Applies to both Fresh & weighed and World & specialist (both food groups).

## Changes
- **New `src/data/allergens.js`** — the single 14-allergen list; `PpdsLabelTool` now imports it (removed its local copy).
- **Product model** (`inventoryStore.normaliseNew`): added `allergens` (array of the 14 labels), `ingredients`, and `size`/`sizeUnit` (unit pricing). `updateProduct` already merges arbitrary patch keys.
- **Stock edit form** (`InventoryView`): food shops get an "Allergens & ingredients (PPDS)" block — an ingredients textarea + 14 allergen chips; saved on the product. Gated by `isFoodShop()` (fresh-weighed / world-specialist).
- **Stock rows**: a **"⚠ no allergens"** badge on a food-shop product with nothing recorded (the "block ready for sale" intent surfaced as a visible flag — there is no sale flow to hard-block in the PWA).
- **PPDS tool** now has two modes: **PPDS label** (prefill from a saved product → name/ingredients/allergens, allergens auto-emphasised on print/share) and **Allergen sign** (a non-prepacked matrix listing products with their recorded allergens, to show/print).

## Verification
- **FE 509/509 (+1) + build green.** New coverage: allergens/ingredients persist on add + merge on update. **SW v20→v21.**
- **Not performed here:** live 375px/console re-audit — browser-only.

## Remaining in Phase 2B (next increment)
- **Beef** origin fields + daily slaughterhouse/cutting-plant **licence-number log** + point-of-sale origin card.
- **Fish** commercial/Latin name + production method + catch-area fields.
- **Fruit & veg** class / origin / variety / size-count fields.
(These are member-specific label schemes; the allergen core above is the cross-group headline and ships now.)

## Follow-ups
- [ ] Owner: redeploy Vercel (SW v21); re-audit the Fresh/World allergen capture at 375px.
- [ ] Phase 2B part 3 (beef/fish/produce origin + licence log), then 2C (World/health-food) and 2D (Mobile/value).
