# 2026-07-16 — Independent per-product margins

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Accounting]] · [[API-Routes]] · [[Data-Models]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
User: "for margin setting … give them independent margins so the shop owner can set accordingly to their shop and the product." Store-level (default) and category margins already existed; the missing axis was **per-product**. Add a product-level override so an owner can pin one product's margin regardless of its category.

## Design — resolution order
**product override → category rule → store default.** Only the *target* is overridden per product; min/max/VAT still come from the category so the green/amber/red alerts stay meaningful.

## Changes
- **`models/Product.js`** — added `pricing.targetMargin` (Number, default `null` = inherit).
- **`services/marginService.js`** — new `getRuleForProduct(settings, product)` (merges override onto the category rule; nudges `minMargin` down if the override sits below it); exported.
- **`routes/marginRoutes.js`**:
  - `GET /margins/products?search=&limit=&onlyOverrides=` — products with cost, price, **actual margin**, **effective target + source** (`product|category|default`), suggested retail, and green/amber/red status.
  - `PUT /margins/products/:id` (`supervisor`) — set/clear the override; `applySuggestedPrice:true` also repriced `retailPrice` to the suggested retail in one go.
  - `GET /margins/calculate` now accepts a `targetMargin` override query param.
- **Frontend** — `services/margins.js` (`getProductMargins`, `setProductMargin`); `MarginSettingsPage.jsx` new **Per-Product Margins** table (search, per-row % input, **Set** / **Set & reprice**, status dot, effective-target + source, suggested price).

## Decisions
- **Override lives on the Product** (`pricing.targetMargin`), not in `MarginSettings` — it travels with the product and is what pricing already reads.
- **Override = target only.** Keeping min/max/VAT from the category avoids silently disabling under-margin alerts.
- Surfaced in `MarginSettingsPage` (all margin config in one place) rather than surgery on the 600-line `ProductsPage` form.
- `Set & reprice` makes it a one-tap action: set 45% → price jumps to the suggested £ instantly.

## Gotchas
- Product `pricing.vatRate` is a string enum (`standard|reduced|zero`); the numeric VAT for margin maths comes from the resolved **rule** (`vatRate` 0/5/20), and `priceIncludesVat` decides whether to strip VAT before computing actual margin.
- `calcBreakdown` rounds suggested retail **up** to the nearest £0.05.

## Verification
- Backend loads ✅; unit sanity-check of `getRuleForProduct` (category 30 → override 45 `source:product` → default 30) and `calcBreakdown` (£2.00 @ 45% → £4.40 inc VAT) ✅.
- Frontend `npm run build` ✅.

## Commit(s)
- _(to be filled after push)_

## Follow-ups
- [ ] Optional: same override field inline in the `ProductsPage` edit form for people who price from the catalogue.
- [ ] Optional: bulk "apply suggested price" for all red-status products.
- [ ] Show the per-product target on the POS margin badge when `showMarginOnPOS` is on.
