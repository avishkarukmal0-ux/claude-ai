# 2026-10-12 — Re-audit (v22) residuals: demo reset, niche fit, extra tap targets

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Reaudit-v19-Fixes]]

**Domain(s):** demo mode, quick-tool gating, tap targets
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `3aaaf96`

The owner re-audited **v22**; items 1, 3, 4, 5, 6, 7, 8 of this batch were already fixed in **v23** (`3aaaf96`). The genuinely-new residuals, now done:

- **Demo reset (item 9)** — a Pet shop could still show the grocery sample (bread/milk) because the demo
  catalogue was loaded before the type was chosen. New `reloadDemoData()` + `demoDataStale()` in `demo.js`:
  picking a type in onboarding now refreshes the sample, and the demo banner shows a **"Reset sample data"**
  button when the loaded sample no longer fits the saved type.
- **Niche fit (item 10)** — **Trading permits** now shows for the **Market trader only** (`hideForMembers`
  Discount & Pet shop) — street-trading consent isn't a pound-shop/pet-shop concern.
- **Tap targets (item 2 extras)** — Traceability mode tabs, Temperature "Delete reading", and the Supplement
  checklist rows + novel-food select/date all raised to ≥44px.

Already live from v23 (confirmed, not redone): ScreenBack on Count stock/Orders/Staff/Takings/Team tasks +
Receive a delivery; Send note / Date-code / checklist / Hand over / Stock search 44px; PPDS inline allergen
emphasis + likely-allergen flagging; frozen −18°C "reported — confirm"; vape-check disposable block; festival
nudges default OFF; MUP "Wales 65p since 1 Oct 2026"; persist-on-first-save + denial warning; Delete product
ConfirmDialog + Undo.

## Verification
- **FE 518/518 (+2) + build green.** New tests: demo stale→reload; trading-permits market-trader-only. **SW v23→v24.**
- **Not performed here:** live 375px/console re-audit — browser-only.

## Follow-ups
- [ ] Owner: redeploy Vercel (SW v24); re-audit v24.
- [ ] Optional leftover: per-product persistence of beef/fish/produce origin fields.
