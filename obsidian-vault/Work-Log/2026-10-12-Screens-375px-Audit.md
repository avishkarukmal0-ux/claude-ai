# 2026-10-12 — Screens audit (375px): Stock, nav routing, Buy, Today

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Home-375px-Polish]] · [[2026-10-12-Tokens-Reskin]]

**Domain(s):** Stock (InventoryView), home nav/tabs (HomePage), Buy hub, Today, manifest
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `f6cdcf7`

## Changes (owner's live 375px audit; no business-logic changes)

### STOCK (`InventoryView`)
- **≥44px tap targets:** qty +/- (32→44), Edit/History/Delete icon buttons (→44), Import/Suppliers/Add header
  buttons (36→44), the inline supplier `<select>` / expiry `<input type=date>` / date-type `<select>` (26–28→44,
  wrap to their own rows on 375px), and the Count/Refill/Slow/By-category filter chips (30→44, in HomePage).
- **Delete:** separated from Edit (divider + danger tint) and now `window.confirm`s before removing the product
  (it deletes the product + its stock number; can't be undone in-place).
- **Fonts:** category headers, meta line, status/case/expiry chips raised to ≥12px (`text-xs`).

### GLOBAL
- **Routed tabs:** the bottom nav is URL-driven — each item is a `<Link to="/home?tab=…">` (a real anchor) with
  `aria-current`, inside `<nav aria-label="Primary">`; a `location.search` effect syncs the active tab. So the
  **browser Back button now moves between tabs**, tabs are bookmarkable/shortcutable, and `go({tab})` pushes
  history. (Chose history-backed `/home?tab=` over literal `/scan` top-level routes to avoid a risky refactor of
  the heavily-tested single-`/home` shell; behaviour/acceptance is met.)
- **Visually-hidden `<h1>` per view** — reflects the open screen or active tab.
- **Header** Change/Account ≥44px (from the earlier /home pass) retained.
- **manifest shortcuts:** Scan / Stock check / Buy. "New sale" from the list was NOT added — the sale/till flow
  is deferred, so that shortcut would dead-end.

### BUY
- Top 4 destinations (journey, buy list, orders, suppliers) up front; the other ~10 tools collapse under an
  **"All buying tools"** toggle so routine jobs aren't buried in a 14-tile wall.

### TODAY
- **"No backup yet"** nudge (data is on this device only) surfaces until the first export, then disappears.
  Hidden in demo/sample mode.

## Verification
- **FE 466/466 tests + production build green** (+3 new: a HomePage URL→tab routing test — `/home?tab=stock|buy`
  render the right tab, exactly one `aria-current`, nav items are anchors with tab hrefs).
- **Not performed here:** the acceptance's live 375px re-audit (every interactive element ≥44px), a physical
  Back-button press, and the runtime console check — all need a real browser (no `playwright` npm in this
  project). Do them on production/preview after deploy.

## Notes / deviations (documented)
- Tabs use `/home?tab=` (history-backed) rather than literal `/scan` etc. — equivalent Back/anchor/aria behaviour
  without a route-table rewrite. Say so if literal paths are required.
- "New sale" shortcut omitted (till deferred).
- The tiny numeric COUNT badges (nav dot, row count) remain <12px as decorative indicators, not prose.

## Follow-ups
- [ ] Owner: redeploy Vercel; re-run the 375px audit + Back + console check in a browser.
