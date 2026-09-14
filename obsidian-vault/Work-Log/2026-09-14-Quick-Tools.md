# 2026-09-14 — Quick tools: MTD countdown, margin calc, age-check helper

Back to [[Work-Log]] · Related: [[2026-09-14-Mobile-App-Home]] · [[Winning-Strategy]] · [[Go-To-Market]]

## Goal
Give shops real value the moment they open the app — glance-and-go **helper tools that need no login and no backend** (the "eat the bait" pull). Explicitly NOT a POS: no sales, no payments, no logging.

## What changed (files)
- 🆕 `frontend/src/components/quicktools/MtdCountdown.jsx` — days to the next MTD update (indicative quarterly dates 7 Aug/Nov/Feb/May) + next-deadline card.
- 🆕 `frontend/src/components/quicktools/MarginCalculator.jsx` — cost + sell → profit £, margin %, markup %; warns on below-cost.
- 🆕 `frontend/src/components/quicktools/AgeCheckHelper.jsx` — Challenge-25 cut-off date + DOB checker (✅/❌ + "ask for ID" under 25). Disclaimer: helper only, the till does the real refusal log.
- 🆕 `frontend/src/config/quickTools.js` — registry + `getQuickToolsForFamily()`; universal tools (MTD, margin) for all, `age-check` gated to families with the `age-check` module.
- ✏️ `frontend/src/pages/HomePage.jsx` — "Quick tools" horizontal strip on the Home tab + a bottom-sheet modal that renders the chosen tool.

## Why (strategy)
Instant, universal, zero-friction value = the land-and-expand bait ([[Go-To-Market]]). Each passes the [[Winning-Strategy]] Accuracy Filter (MTD = deadline; margin = money; age-check = compliance risk). Per-shop-type gating makes the shopType dial pay off again.

## Not a POS (important)
These are counter references/calculators. No transaction, payment, or audit record. Real age-gating + refusal logging stay in the till (Phase 2, `Challenge25Page`).

## Verification (headless Chromium @ 390×844)
- `npm run build` ✓.
- Off-licence home shows 3 tools. MTD = **54 days** (→ 7 Nov). Margin 0.80→1.20 = **£0.40 / 33.3% / 50.0%**. Age DOB 2010 = **"Under age — 16"**; cut-off shows 14 Sep 2008. No page errors. Screenshots in scratchpad.

## Commit
- feat(app): quick tools — MTD countdown, margin calculator, age-check helper
