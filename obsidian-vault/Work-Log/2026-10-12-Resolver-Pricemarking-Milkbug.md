# 2026-10-12 — Single niche resolver, price-marking rollout, milk-unit bug

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Compliance-Phase0-1]]

**Domain(s):** niche config, inventory FEFO, markdown label, Stock rows, Expiry & waste form
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `955a2b3`

Owner's three follow-ups after the Phase 0/1 report.

## 1. Single `resolveNiche` (single source of truth)
- New **`src/config/niche.js`**: `resolveNiche({familyId, memberId, profile}) → {group, member, accent, tools, nudges, demoData, onboardingQuestions}` plus `onboardingQuestionsFor(familyId)`. It composes the concern functions (quick-tool gating, today nudges, demo catalogue, question set) so every niche difference is read from ONE place — the distributed wiring is what let the 11 types drift into clones.
- Wired: `HomePage` reads `niche.tools` + passes `niche.nudges` to `TodayAtShop` (now presentational, takes a `signals` prop); `NichePickerPage` renders questions from `onboardingQuestionsFor`; `demoCatalogue` exported from `demo.js` and owned by the resolver.

## 2. Price Marking Order rollout (Phase 1.7, now applied)
- **Mark-down label** (`markdownLabelText`): prices show **incl. VAT** and, when pack size is known, a **unit price** (£/kg · 100ml…). `createMarkdown` now carries `size`/`sizeUnit`; WasteView passes them from the product.
- **Stock rows** (`InventoryView`): price shows "incl. VAT" + a unit-price chip where size exists.
- Both reuse the one `lib/priceMarking.js` helper (so the Phase-2 weigh-and-label flow uses the same maths).

## 3. Milk-unit bug — FIXED
- **Root cause** (`inventoryStore.fefo`): once a product had ANY dated batch, the "Sell first" loop used the batches-only branch and the still-dated **undated residual** units dropped out of both "Sell first" and "£ at risk". Date-coding 2 of 3 use-by milk → the 3rd unit vanished and £-at-risk fell.
- **No data loss**: `addBatch` never reduced the total (confirmed); the units were only hidden from the review list.
- **Fix**: `fefo` now emits a residual row (`qty − Σbatches`, product-level date) in ADDITION to batch rows. Regression test: 3 use-by units, date-code 2 → rows total 3 (batch 2 + residual 1).
- Also labelled the two previously-unlabelled date-code inputs (`aria-label` Quantity / Expiry date; the first IS the quantity field, confirming the owner's caveat).

## Verification
- **FE 503/503 (+1) + build green.** New/updated: batches milk-bug regression, resolveNiche test. **SW v17→v18.**
- **Not performed here:** live 375px/desktop/console re-audit — browser-only.

## Follow-ups
- [ ] Owner: redeploy Vercel (SW v18); confirm the milk count/£-at-risk now hold after date-coding, at 375px.
- [ ] Phase 2 (new per-group features) — await go-ahead.
