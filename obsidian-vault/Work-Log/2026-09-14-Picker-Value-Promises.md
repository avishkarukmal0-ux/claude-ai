# 2026-09-14 — Picker: value promises, trust strap, log-in link

Back to [[Work-Log]] · Related: [[2026-09-14-Recategorise-Niches-4-Families]] · [[Winning-Strategy]]

## Goal
Make the front door both *sell* and *work*: add burden-first value promises per family, a trust strap-line, and a way back for returning users.

## What changed (files)
- ✏️ `frontend/src/config/shopTypes.js` — added `promises[]` (3 burden-first lines) to each of the 4 families.
- ✏️ `frontend/src/pages/NichePickerPage.jsx` — (1) trust strap under the title ("Built for UK shops · MTD-ready · Works alongside your till"); (2) family promises rendered with accent checks on the sub-type step; (3) "Already using Vendora? Log in" link (→ `/login`) in the footer of both steps.

## Why (strategy)
Promises = [[Winning-Strategy]] burden-first made visible ("Your HMRC filing just happens", "Stop paying twice for waste"). Log-in link closes the gap left when login stopped being the forced entry.

## Verification (headless Chromium @ 390×844)
- `npm run build` ✓.
- Step 1: trust strap + 4 families + log-in link. Step 2: 3 promise bullets + sub-types + confirmation + log-in link. Flow + persistence unchanged. Screenshots in scratchpad.

## Commit
- feat(app): value promises, trust strap & log-in link on the picker
