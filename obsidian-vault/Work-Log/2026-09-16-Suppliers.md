# 2026-09-16 — Suppliers + buy-list grouped by where you buy

Back to [[Work-Log]] · Related: [[2026-09-16-Reorder-Buy-List]] · [[2026-09-14-Goods-In-And-Inventory]] · [[Implementation-Roadmap]]

## Goal
Founder: every niche has inventory AND regular buying places — add those. Build a **Suppliers** feature (niche-aware) and wire it through inventory → the buy list, so the cash-&-carry list is **organised by where you go**.

## What changed (files)
- 🆕 `frontend/src/lib/supplierStore.js` — localStorage `useSuppliers()` (add/update/remove) + `supplierName()` lookup.
- 🆕 `frontend/src/components/suppliers/SuppliersView.jsx` — manage regular buying places (name/phone/notes) + **per-family suggestion chips** (tap to add).
- ✏️ `frontend/src/config/shopTypes.js` — `supplierIdeas` per family (grocery: cash&carry/soft-drinks/tobacco/newspaper/roundsman · fresh: veg market/meat-fish/bakery/packaging · world: ethnic cash&carry/import/halal/spice · mobile: general cash&carry/clearance/pet-food); `suppliers` module now `live` (`screen:'suppliers'`).
- ✏️ `inventoryStore.js` — product carries `supplierId`. ✏️ `InventoryView` — supplier `<select>` in the add form + a per-row supplier picker.
- ✏️ `buyListStore.js` — buy-list items snapshot `supplierId`/`supplierName`. ✏️ `ReorderView` — buy list **grouped by supplier** (named suppliers first, "No supplier yet" last), each group showing its unit total.
- ✏️ `HomePage.jsx` — render `SuppliersView` for `screen==='suppliers'`.

## Verification (headless Chromium @ 390×844, convenience)
- `npm run build` ✓.
- Suppliers screen shows niche ideas → tap "Cash & carry (Booker/Bestway)" → listed. Stock product's supplier dropdown → assigned. Buy list add → item **grouped under "Cash & carry (Booker / Bestway) · 5"**. No page errors. Screenshots `suppliers.png`, `buylist-grouped.png`.

## Why (strategy)
Every shop, every niche, buys from regular places — the buy list only pays off when sorted by where you go. Ties suppliers ↔ products ↔ buy list into one loop. Maps cleanly onto the v3 `Supplier` model for later sync (ADR-001).

## Commit
- feat(app): suppliers (niche-aware) + buy list grouped by supplier
