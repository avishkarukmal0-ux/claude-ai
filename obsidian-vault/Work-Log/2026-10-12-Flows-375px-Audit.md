# 2026-10-12 — Flows audit (375px): back control, Waste, Buy, Report, Stock

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Screens-375px-Audit]]

**Domain(s):** shared back control, Waste, Reorder, Weekly report, Overview, Payments, Stock, home banner
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `466eca7`

## Changes (owner's sub-screen 375px audit; no business-logic changes)

### Global
- New shared **`components/common/ScreenBack`** — one ≥44px-tall control with a chevron and a fixed
  `aria-label="Back"` (visible word still "Home"). Replaces the ~20px inline back links on Waste, Buy list,
  Weekly report, Owner glance, Payments due.
- **Font sweep:** every `text-[10px]`/`text-[11px]` → `text-xs` across `src` (312 occurrences, 60 files).
  Only the ≤9px numeric nav/count badges remain (decorative, by design).

### Expiry & waste (`WasteView`)
- Mark down / Bin → ≥44px with a 12px gap. **Bin now offers an Undo toast** (restores stock + removes the
  ledger entry through the existing safe `undoEntry` path, which honours the recovery flag).
- Quick-log £/Qty inputs and "Binned it / Saved it" → ≥44px; inputs use 16px text (no iOS zoom).

### Buy list / Weekly report
- Reorder "Add" 36→44px; Weekly report "Download" 32→44px.

### Stock (`InventoryView`)
- Product **name wraps to 2 lines** (`line-clamp-2`) — no more "Va…"/"Baker…" truncation.
- Edit / History / Delete collapse into a **"⋮" kebab menu** (role=menu; outside-tap closes) so the row isn't a
  wall of icon buttons; Delete is last, danger-tinted, and still `window.confirm`s.

### Home demo banner
- Slimmed: shorter one-line copy ("Demo data — your real shop is safe." / "Sample data — try Vendora."),
  tighter padding; the Exit/Create-shop CTAs keep a 44px tap area via negative-margin padding so the banner
  itself stays slim.

## Verification
- **FE 466/466 + production build green.** No logic changed; earlier audit tests still pass.
- **Not performed here:** the live 375px re-audit (every element ≥44px) + console check — browser-only (no
  Playwright in-project). Do on production after deploy.

## Not applied / flagged
- `vendora-tap-targets.css` was referenced as "pasted below" but **no contents were included**, and its local
  Windows path is unreachable from this cloud session. Tap targets were met via the component edits above;
  paste the CSS to fold it into `index.css`.
- "Fix the product-name selector" interpreted as the product NAME truncation (fixed to wrap); the per-row
  supplier `<select>` was already raised to ≥44px in the prior Stock pass.

## Follow-ups
- [ ] Owner: redeploy Vercel, then re-audit all screens at 375px in a browser.
