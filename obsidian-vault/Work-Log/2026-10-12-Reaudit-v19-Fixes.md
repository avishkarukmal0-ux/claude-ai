# 2026-10-12 — Re-audit (v19) fixes: back buttons, tap targets, PPDS emphasis, persist warning, delete dialog

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Phase2-Rest-World-Mobile]]

**Domain(s):** back controls, tap targets, PPDS, temperature, vape check, festivals, MUP, storage persistence, delete flow
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `7da94df`

The owner's re-audit was against **v19**; several of its items (temperature hot-hold/display/export + 44px chips, the vape block at product-add) already shipped in v20–v22, and item 10's Phase-2 work is already live. The genuinely-new fixes:

1. **Back buttons** → shared `ScreenBack` (≥44px, chevron, `aria-label="Back"`) on Count stock, Orders, Staff view, Takings & cash-up, Team tasks; **added one to Receive a delivery** (new `onBack` prop, wired from HomePage).
2. **Raised to ≥44px**: Staff view "Send note"; Expiry & waste "Date-code stock"; Team tasks Opening/Closing checklist + "Hand over to next shift"; Stock search field (also 16px text, aria-label). (Temperature chips were already 44px.)
3. **PPDS** — allergen keywords are now **emphasised INSIDE the ingredients text** (bold + CAPS on the label/print), and the tool **flags likely allergens** from the ingredients (e.g. wheat → Cereals containing gluten) with an "Add these" button. Keeps the ALLERGENS line. New `ALLERGEN_KEYWORDS` + `detectAllergens`/`emphasiseIngredients` in `data/allergens.js`.
4. **Temperature** — frozen −18°C now labelled **"reported — confirm"** (chilled 8°C / hot-hold 63°C stay the verified figures). (Hot-hold + display units + corrective-action + CSV export already shipped v20.)
5. **Vape product check** — added the **"Rechargeable AND refillable with a replaceable coil?"** question → **blocks** "Single-use vapes cannot be sold" (mirrors the product-add block).
6. **Festival nudges** — now **OFF by default for everyone**; appear only when the owner opts in (`festivalsEnabled` returns false unless `profile.festivalsOn === true`).
7. **MUP copy** — "65p/unit in Scotland and, in Wales, 65p/unit since 1 Oct 2026".
8. **Persistence** — `requestPersistentStorage()` now also fires on the **first real save** (`ensurePersistOnce` in the write path) and records a state (`PERSIST_EVENT`, `getPersistState`). A **visible warning banner** ("Your data could be cleared by the browser — export a backup") shows on Home when the browser **denies** persistence, with Export + Dismiss.
9. **Delete product** — replaced `window.confirm` with an accessible **`ConfirmDialog`** (role=dialog, focus-trapped via `useDialog`, Escape/overlay to cancel) **plus Undo**: delete shows a 6s "Undo" toast that calls new `restoreProduct(product)` (re-inserts the exact product, **id preserved** so stock history stays linked).

## Verification
- **FE 516/516 (+5) + build green.** New tests: allergen detect/emphasise; delete→restore (id preserved); festival-off default updated. **SW v22→v23.**
- **Not performed here:** live 375px/console re-audit — browser-only.

## Item 10 (continue Phase 2) — already live
World & health-food (import/health-claim/supplement), Mobile & value (trading permits/recall/animal/vet-meds), Fresh weigh-and-label, registration, and beef/fish/produce origin (via the Traceability tool) all shipped in v20–v22. Optional leftover: per-**product** persistence of origin fields.

## Follow-ups
- [ ] Owner: redeploy Vercel (SW v23); re-audit v23.
