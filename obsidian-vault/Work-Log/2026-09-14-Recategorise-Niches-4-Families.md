# 2026-09-14 — Recategorise niches into 4 families

Back to [[Work-Log]] · Related: [[2026-09-14-Niche-Picker-Front-Door]] · [[Go-To-Market]] · [[Niche-Pain-Research]] · [[Implementation-Roadmap]]

## Goal
Founder observation: the niche list had overlaps ("some are the same"). Recategorise the ~12 shop types by the **module bundle** each needs (not by name), and make the picker show **4 broad category tiles** (founder's choice) with an optional sub-type step.

## The 4 families (grouped by shared module bundle)
| Family | Shared bundle | Members |
|---|---|---|
| **Grocery & age-restricted** | barcode grocery + goods-in + margins + **age-verification** + PMP | Convenience/Mini-mart · Off-licence · Newsagent/CTN · Vape & CBD |
| **Fresh & weighed** | **scale/loose-weight** + expiry/use-by + markdown + traceability/PPDS + production | Greengrocer · Butcher/Fishmonger · Bakery/Deli |
| **World & specialist foods** | perishables + suppliers + **allergen/compliance** + cultural-calendar demand | International grocer · Health-food |
| **Mobile & value** | **ad-hoc/no-barcode pricing** + phone-first + dead-stock | Market trader · Discount/Pound · Pet shop |

**Why it matters:** off-licence/newsagent/vape aren't separate builds — they're the grocery core + one toggle. So we build **4 module bundles, not 12**; each shop switches on its extras.

## What changed (files)
- ✏️ `frontend/src/config/shopTypes.js` — restructured from a flat 9-list into `SHOP_FAMILIES` (4 families, each with `members[]`). Storage now `"familyId"` or `"familyId:memberId"`; helpers `getFamily`, `getMember`, `getSavedShopType` (returns `{familyId, memberId}`), `saveShopType(familyId, memberId?)`.
- ✏️ `frontend/src/pages/NichePickerPage.jsx` — two-step: 4 family cards → tap → optional sub-type grid with a family header + "All shop types" back link + confirmation. Family alone is a valid choice.

## Verification (headless Chromium @ 390×844)
- `npm run build` ✓.
- Step 1: 4 family tiles (Grocery & age-restricted, Fresh & weighed, World & specialist foods, Mobile & value).
- Step 2: tap Grocery → 4 sub-type chips; pick Off-licence → "Vendora is set up for Off-licence."; **survives reload** (reopens on sub-step, member selected). Screenshots in scratchpad.

## Follow-ups
- Backend `shopType` will store `{family, member}`; modules key off `family` first, `member` for the toggle.
- Still open: what happens after a pick (continue into the app / onboarding).

## Commit
- refactor(app): recategorise shop types into 4 families with optional sub-type
