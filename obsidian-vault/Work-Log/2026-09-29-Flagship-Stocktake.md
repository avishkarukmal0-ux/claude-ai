# 2026-09-29 — Flagship ②: Stocktake / audit mode

Back to [[Work-Log]] · Related: [[2026-09-29-Smarter-Brain]] · [[Implementation-Roadmap]]

## Goal
Second item in the 10x order: **one big headline feature that's genuinely useful, not bloat.**
Founder steer: "make this useful to shop owners, don't fill it with many things."
Chosen (my rec): **Stocktake / audit mode** — a single workflow that makes the whole app's
data trustworthy and puts a hard £ on shrinkage/theft. No hardware.

## Why this one
- Corrects real stock levels → velocity, reorder and insights (built earlier today) become accurate.
- Turns a dreaded 1–2 hour job into a phone walk-round.
- Puts a £ number on theft/waste — the original wedge — which suppliers' apps can't do.
- It's *one* coherent feature, not a pile of options.

## What shipped (local-first, no backend)
- `lib/stocktakeStore.js` — active count session + history; `buildSummary()` computes
  expected-vs-counted variance, £ shrinkage, overage, net per count (biggest loss first).
- `inventoryStore.setCounts()` — applies counts as **corrections**: never records a movement /
  sale, so a stocktake can't pollute velocity (verified: movements stayed 0 after apply).
- `components/stocktake/StocktakeView.jsx` — start a count → **scan-to-count** (+1 per scan,
  reuses `BarcodeScanner`) or type quantities → live progress + running variance → review screen
  (headline shrinkage £ + discrepancy list) → one-tap **apply to stock** → past-counts history.
- Registered as a core module tile (`stocktake`); screen wired in `HomePage`.

## Verification (headless Chromium @ 390×844)
- Seeded Coke qty 12 / Crisps qty 30. Counted Coke 9 (−3), Crisps 30 (match).
- Review: **−£1.50 shrinkage** (3 × £0.50 cost), discrepancy row "Expected 12 · counted 9 · −3".
- Apply: Coke qty→9, Crisps→30, **movements=0** (not a sale), history=1 (shrink £1.50), session cleared. No errors.
- `npm run build` clean.

## Commit
- `949f825` feat(app): flagship — Stocktake / audit mode with £ shrinkage

## Next
- 10x order remaining: **③ Real-app feel** (polish/speed/install/onboarding), then **④ PWA superpowers** (push/share-target/pocket brief).
