# 2026-10-12 — Phase 2 finish: traceability + World/health-food + Mobile/value

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Phase2B-Allergens-PPDS]]

**Domain(s):** quick tools (7 new), tool gating, new stores
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `10cd21e`

Completed the rest of Phase 2 in one increment: the remaining Fresh traceability, all of Group C (World & health-food) and all of Group D (Mobile & value). Every tool carries a source + last-verified; nothing O is hard-coded.

## Gating
- `getQuickToolsForShop` now supports **family-scoped tools** (`families: [...]`), alongside `requiresModule`, `hideForMembers` and `gate`. This is how Mobile & value (which has no compliance module) gets its tools, and how World-only tools stay off the Fresh menu.
- New helper `lib/simpleStores.js` (`useArrayLog`, `logCsv`) backs the log tools.

## New tools
### Fresh & weighed (2B rest)
- **Traceability** (`traceability`, requiresModule scale-labels): **Origin card** (member-aware fields — beef / fish / produce — printed/shared as a point-of-sale card) + **Licence log** (daily slaughterhouse/cutting-plant numbers, CSV export). `licence_log_v1` store.

### World & specialist (2C)
- **Import label check** — checklist (ingredients, 14 allergens, UK importer address, origin, date mark, English) + importer field + "needs relabel" summary + NI-address warning.
- **Health-claim check** — soft checker flagging "healthy / boosts immunity / detox …" in shelf text unless tied to an authorised claim; evidence field; GB NHC register link.
- **Supplement check** — label checklist + novel-food "checked on the FSA register?" + date.

### Mobile & value (2D)
- **Trading permits** (`trading_permits_v1`) — consent number/council/pitch/expiry + insurance level/expiry with expiry countdowns; no council limits hard-coded.
- **Recall log** (`recall_log_v1`) — product/supplier/action/supplier-evidence, CSV export; no compliance claims.
- **Animal licence** (`animal_licence_v1`, gate: sellsAnimals) — council licence/expiry/risk rating + "no market-stall animals" and England "Lucy's Law" warnings.
- **Vet medicines** (gate: sellsAnimals) — distribution category (AVM-GSL / NFA-VPS / POM-VPS); **blocks OTC** of non-GSL unless an SQP is recorded; premises SQP/authorisation expiry (shares `animal_licence_v1`).
- (Today-tab "price anything / reconcile" promises were already reworded in Phase 1; markdown already refuses past-use-by and warns on tobacco/vape — no extra quick-sale flow built.)

## Verification
- **FE 511/511 (+2 gating) + build green.** New stores registered in `STORE_NAMES` + backup `STORE_SHAPE`. **SW v21→v22.**
- **Not performed here:** live 375px/console re-audit — browser-only.

## Deliberately NOT hard-coded (O / reported)
- Beef/fish/produce field rules, importer/English-text rule, CBD limits, TVA dates, product-safety duties, SQP spot-on categories — all shown as checklists/"confirm" notes with official links, never as blocking logic (except the two VERIFIED safety blocks already shipped: past-use-by markdown, disposable-vape add, and the SQP OTC block which is a verified requirement).

## Remaining from the brief (optional, flagged)
- Per-product persistence of beef/fish/produce origin fields (the Traceability tool captures + prints them; it doesn't store them on each product).
- A quick-price / quick-sale flow (promises were reworded instead, per the brief's either/or).

## Follow-ups
- [ ] Owner: redeploy Vercel (SW v22); re-audit all four groups at 375px.
