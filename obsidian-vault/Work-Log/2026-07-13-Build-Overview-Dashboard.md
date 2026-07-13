# 2026-07-13 — Build "This Week" owner dashboard (flagship)

Back to [[Work-Log]] · [[Home]] · [[Overview-Dashboard]] · [[Positioning]]

**Domain(s):** [[Overview-Dashboard]] · [[Positioning]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Build the flagship screen that makes the positioning visible: lead with £ lost to theft and £ of stock at risk to waste, then sales & margin. Placement: new nav page (owner chose this; can be promoted to login landing later).

## Changes
- **NEW** `backend/src/routes/overviewRoutes.js` — `GET /overview/this-week` (supervisor). Aggregates:
  - theft £ (ShrinkageLog sum, WoW), incidents, open cases, per-transaction "crime tax"
  - waste £ (expired value + expiring-≤7d value from Product.expiryBatches)
  - sales/margin via `reportService.getMarginAnalysis`, transaction count
  - alert counts (open incidents, pending scan patterns, expired, expiring soon)
- `backend/src/routes/index.js` — mounted `/overview`.
- **NEW** `frontend/src/services/overview.js`, `frontend/src/pages/OverviewPage.jsx`.
- `frontend/src/App.jsx` — `/overview` route (supervisor).
- `frontend/src/components/Sidebar.jsx` — new top "Overview → This Week" section (supervisor+).

## Decisions
- Real data only, no mocks. Waste shown as **at-risk/recoverable** (honest) rather than "saved" — true "saved" needs markdown *sales* logging (follow-up).
- Trend colour is semantic: theft ↑ = red (bad), sales ↑ = green (good).
- Kept as a nav page; promoting to owner landing = one-line `index` route change.

## Verification
- Frontend `npm run build` ✅
- Backend `require('./src/routes/index.js')` ✅ and `require('./src/app.js')` ✅ assemble clean

## Commit(s)
- _(pending)_ — `feat: owner "This Week" overview dashboard (theft + waste + margin)`

## Follow-ups
- [ ] Optionally make Overview the owner's post-login landing screen
- [ ] Log markdown sales → show "waste £ recovered" (actual, not potential)
- [ ] 4-week sparklines
