# 2026-10-15 — Perf: window the Stock & Count lists

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Frontend-Overview]] · Inventory (Stock) + Stocktake (Count) screens
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
The Stock list rendered **every** product at once. With the 600-product demo it built ~26k DOM nodes up
front, blocked for seconds on open, scrolled janky, and each +/- re-rendered all rows. Acceptance: 600
products → Stock opens under 300ms blocking, scroll near 60fps, +/- feels instant. Same treatment for the
Count screen (604 rows) if cheap.

## Changes
- `frontend/package.json` / lock — added **`@tanstack/react-virtual@^3.10.8`** (+ its `virtual-core` dep; ~5kB,
  the only new runtime dep).
- `components/inventory/InventoryView.jsx`
  - **Windowed the Stock list.** The category groups are flattened into one `flat` array (a `header` item per
    category, then its `row` items); `useVirtualizer` renders only the on-screen slice. Virtualises against the
    page scroller `<main id="main-content">` via `getScrollElement`, with `scrollMargin` = the list's offset
    below the scroller top (measured with `getBoundingClientRect`, remeasured in a `useLayoutEffect` whenever the
    content above the list changes height — add/edit form open, query, counts). Rows self-measure
    (`ref={rowVirtualizer.measureElement}`) so variable-height rows don't overlap.
  - **Debounced search ~200ms** (`debouncedQuery`): the input stays controlled by `query` (instant), the
    filter/group work runs off the debounced value.
  - **`React.memo(ProductRow)`** + stable `onEditProduct`/`onHistoryProduct` (`useCallback`); the row now calls
    `onEdit(p)` / `onHistory(p.id)` itself instead of each row capturing a fresh closure. `updateProduct` already
    replaces only the changed product immutably, so a +/- re-renders just that row.
  - **Threshold `flat.length > 60`:** small shops render exactly as before (no scroll container, no absolute
    positioning) — zero behaviour change for the common case.
- `components/stocktake/StocktakeView.jsx` — same pattern on the counting list (flat, no category headers):
  virtualiser over `filtered`, debounced search, `onCountInput` wrapped in `useCallback`, and the row extracted
  as **`React.memo(CountRow)`** with primitive props (`counted`/`isNeg`) + stable `onCount`. Same `>60` threshold.
- `public/sw.js` — `CACHE_VERSION` v58 → **v59**.

## Decisions
- **Virtualise against `#main-content`, not a new inner scroll container.** Keeps the single page-scroll UX
  (header + search scroll with the list) instead of nesting a second scrollbar. The cost is the `scrollMargin`
  bookkeeping, which the `useLayoutEffect` remeasure handles.
- **Headers kept inline in the flattened list** (they scroll with content, matching the previous behaviour)
  rather than CSS-pinned sticky headers. True pinned-sticky + dynamic row measurement is fragile; the grouping
  is preserved, which was the real requirement. Can revisit if a pinned header is wanted.
- **`>60` threshold** so the virtualisation code path only engages when it pays off; everything below renders
  the original markup.

## Gotchas
- Could not visually verify scroll/fps in this sandbox (no browser; agent proxy blocks the live host). Verified
  by build + full test suite; the windowing math follows the tanstack `scrollMargin` recipe
  (`transform: translateY(vi.start - options.scrollMargin)`).
- In virtual mode `ProductRow`/`CountRow` (`<li>`) render inside `<div>` wrappers rather than a `<ul>` — minor
  HTML-semantics nit inherent to windowing; acceptable.
- Promoted the windowing pattern into [[Conventions]].

## Verification
- `npm run build` ✓ (react-virtual bundled). Full **vitest: 549 passed / 80 files**, no change.

## Commit(s)
- `29760b3` — fix(perf): window Stock & Count lists, debounce search, memoise rows

## Follow-ups
- [ ] Optional: pinned-sticky category headers in the windowed Stock list if the inline headings aren't enough.
- [ ] Optional (standing, user): delete (not just empty) the three Render test-switch env vars; rotate the
      chat-pasted password; move plaintext secrets out of local `CLAUDE.md`.
