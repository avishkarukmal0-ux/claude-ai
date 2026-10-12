# 2026-10-12 — Phase 2B (part 1): Fresh & weighed — weigh/label, temperature, registration

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Phase2A-Offlicence-Vape]]

**Domain(s):** weigh-and-label, temperature log, scale checks, food registration, compliance data
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `d82d600`

First slice of Phase 2B (Group B, Fresh & weighed). The field-heavy per-trade schemes (beef/fish/produce origin + daily licence log) and per-product allergen storage are the next 2B increment — flagged below, not silently dropped.

## Changes (every tool shows source + last-verified; no O fact hard-coded)
- **Weigh & label** tool (new `WeighLabelTool`, fresh-weighed only via `scale-labels` module): pick a per-kg line (or type a £/kg), enter weight → total = weight × £/kg, print/share a customer label (name, £/kg, weight, **total incl. VAT**, optional use-by + allergens). Reuses `lib/priceMarking`.
- **Scale checks** (new `lib/scaleChecks.js` + `scale_checks_v1` store): "Mark verified" and "Record self-check" records, with the latest of each shown (weights & measures).
- **Temperature log** extended: **hot-hold (≥63°C)** and **chilled display** kinds added; out-of-range prompts a **corrective-action note**; **CSV export** (keep ~12 months).
- **Registration & hygiene rating** tool (new `FoodRegistrationTool` + `food_registration_v1`, fresh + world): registered?/date, last inspection, FHRS 0–5; display-mandatory note for Wales/NI vs voluntary England (from the profile nation).

## Verification
- **FE 508/508 (+3) + build green.** New coverage: hot-hold flag + corrective action + temperature CSV; scale checks; weigh/registration tool gating. **SW v19→v20.**
- New stores registered in `STORE_NAMES` + backup `STORE_SHAPE` (scale_checks_v1, food_registration_v1).
- **Not performed here:** live 375px/console re-audit — browser-only.

## Remaining in Phase 2B (next increment, NOT done here)
- **Per-product allergens / PPDS wiring**: allergen (14) + ingredients fields on the product, "allergens not recorded" badge, non-prepacked allergen matrix, feeding the existing PPDS label tool from real product data. (The standalone PPDS label generator already ships.)
- **Beef** origin fields + daily slaughterhouse/cutting-plant **licence-number log** + point-of-sale origin card.
- **Fish** commercial/Latin name + production method + catch area fields.
- **Fruit & veg** class / origin / variety / size-count fields.
- Use-by: existing "pull, don't sell" behaviour kept as-is (verified correct).

## Follow-ups
- [ ] Owner: redeploy Vercel (SW v20); re-audit Fresh group at 375px.
- [ ] Phase 2B part 2 (allergens-on-product + beef/fish/produce origin + licence log), then 2C (World/health-food) and 2D (Mobile/value).
