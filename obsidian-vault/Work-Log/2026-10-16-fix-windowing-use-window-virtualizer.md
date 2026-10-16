# 2026-10-16 — Fix: windowing didn't window (wrong scroller)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Frontend-Overview]] · Inventory (Stock) + Stocktake (Count)
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Follow-up to [[2026-10-15-perf-window-stock-count-lists]]. The windowing I added **did not actually window.**

## Root cause
`useVirtualizer({ getScrollElement: () => document.getElementById('main-content') })` assumed `<main>` was the
scroller. But the shell's `<main>` has `overflow-y:auto` with **no height constraint**, so its `clientHeight`
equals its content height (47,519px on Count, ~155,000px on Stock with 600 demo products) and it never scrolls —
the **document/window** is the real scroller. The virtualiser saw a ~47,000px viewport and rendered ~311/604 rows
initially, then all 604 after any scroll (never unmounting).

## Changes
- `components/inventory/InventoryView.jsx`, `components/stocktake/StocktakeView.jsx`
  - `useVirtualizer` → **`useWindowVirtualizer`** (windows against window scroll — the actual scroller).
  - `scrollMargin` is now the list's **absolute document offset**: `listWrapRef.getBoundingClientRect().top +
    window.scrollY`, remeasured in the same `useLayoutEffect` on the same deps. Dropped the `getScrollElement`
    / `#main-content` reference entirely.
  - `overscan` 8 → 6 (keeps the mounted-row count comfortably under the ~30 ceiling).
  - Render/`transform`/`measureElement`/`getTotalSize` unchanged — those APIs are identical on the window
    virtualiser.
- `components/stocktake/StocktakeView.jsx` `CatChip` — added `min-w-[44px] justify-center` so the short **"All"**
  chip is ≥44px wide (not just tall).
- `public/sw.js` — `CACHE_VERSION` v59 → **v60**.
- [[Conventions]] — corrected the windowing entry (was describing the broken `#main-content` approach) to the
  `useWindowVirtualizer` pattern, with the "why `<main>` isn't the scroller" warning.

## Decisions
- Chose **option (a) `useWindowVirtualizer`** over (b) capping the shell to `h-dvh` with `#main-content` as a real
  `min-h-0 flex-1 overflow-y-auto` scroller. (a) is self-contained to these two components; (b) would touch the
  app shell / HomePage layout and risked the bottom nav. Kept the blast radius small for a pre-launch fix.

## Verification
- `npm run build` ✓. Full **vitest 549 / 80 files**.
- ⚠️ Still no browser in this sandbox, so the live DOM-count/fps/blocking-time acceptance needs a real device:
  with 600 demo products at 375px, `document.querySelectorAll('[aria-label^="More actions"]').length` should stay
  ≲30 while scrolling; Stock open <300ms blocking; scroll ~60fps; search keystroke <100ms.

## Commit(s)
- `7cbcb31` — fix(perf): use useWindowVirtualizer so Stock/Count lists actually window

## Follow-ups
- [ ] User to confirm the DOM-count/fps acceptance on a real device (v60 build).
