# 2026-10-16 — Fix: filtered lists bypassed windowing (threshold too high)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Frontend-Overview]] · Inventory (Stock) + Stocktake (Count)
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Follow-up to [[2026-10-16-fix-windowing-use-window-virtualizer]]. Filtering the Count list by a category chip
(e.g. "Beer") rendered **every** matching row — 60 rows in the DOM with the 600-product demo, expected ~10.

## Root cause
The windowing gate was `virtual = filtered.length > 60`. "Beer" has exactly 60 products → `60 > 60` is false →
fell back to the plain `<ul>` that renders all rows. Any category/search result of **≤60 rows** silently skipped
windowing. The unfiltered 600-row list was `> 60` so it windowed fine, which masked the problem.

## Changes
- `components/stocktake/StocktakeView.jsx` and `components/inventory/InventoryView.jsx`
  - Lowered the gate to **`> 30`** (just above the on-screen row budget) so any filter result big enough to
    matter still windows, while genuinely small lists (≤30) keep the plain markup. The gate already tracks the
    *filtered* length (Count: `filtered`, Stock: `flat`), so category/search narrowing now flows through it.
  - **Reset scroll to the top of the page when the filter changes** (`useEffect` on `[cat, debouncedQuery]` for
    Count, `[debouncedQuery]` for Stock; first run skipped). Switching to a shorter list could otherwise leave
    the window parked past the new end → a blank gap.
- `public/sw.js` — `CACHE_VERSION` v60 → **v61**.

## Decisions
- Kept a threshold rather than always-window: tiny lists avoid the absolute-positioning / `<li>`-outside-`<ul>`
  path. 30 is the smallest value that still satisfies "≤~30 rows in the DOM" for any larger filter result.

## Verification
- `npm run build` ✓. Full **vitest 549 / 80 files**.
- ⚠️ No browser here — on a real device (v61, 600 demo products, 375px): with a category chip or search active,
  `document.querySelectorAll('[aria-label^="Counted quantity"]').length` (Count) /
  `'[aria-label^="More actions"]'` (Stock) should stay ≲30 while scrolling; no blank gaps; list jumps to top on
  filter change.

## Commit(s)
- `d757e7a` — fix(perf): window filtered Stock/Count lists (lower threshold, reset scroll on filter)

## Follow-ups
- [ ] User to confirm DOM-count / no-gap / scroll-to-top acceptance on a real device.
