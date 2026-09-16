# 2026-09-16 — Day-takings + cash-up, and Owner glance goes live

Back to [[Work-Log]] · Related: [[Overview-Dashboard]] · [[Implementation-Roadmap]] · [[Features-To-Build]]

## Goal
Bring real money numbers into the app **without the till or backend**: log the day's takings + count the drawer (variance), and make **Owner glance** a real snapshot.

## What changed (files)
- 🆕 `frontend/src/lib/takingsStore.js` — localStorage `useTakings()` (one record/day: card+cash, float, counted → total takings, expected cash, variance); `entryTotals()`; non-hook `getTodayTakings`/`getMonthTakings`.
- 🆕 `frontend/src/components/takings/TakingsView.jsx` — takings today + this-month cards; entry (card/cash) + cash-up (float/counted) with over/short variance; save today (replaces same-day); recent-days history.
- 🆕 `frontend/src/components/overview/OverviewView.jsx` — **Owner glance**: reads takings + waste + inventory stores → takings today/month, waste wasted/saved, products, low-stock; tappable cards jump to takings/waste/stock.
- ✏️ `frontend/src/config/shopTypes.js` — new core module `takings` (live); `overview` now live (`screen:'overview'`); removed the old duplicate overview entry; added `takings` to `CORE_MODULE_IDS`.
- ✏️ `frontend/src/pages/HomePage.jsx` — render `TakingsView` + `OverviewView`; glance `onOpen` routes to takings/waste screens or the stock tab.

## Verification (headless Chromium @ 390×844)
- `npm run build` ✓.
- Takings: card 200 + cash 150 → **today £350**; cash-up float 50 + counted 195 → **"Expected £200 · £5 short"**. Save → **Owner glance shows Takings today £350 + September £350**, waste £0/£0, products 0. No page errors. Screenshots `takings.png`, `glance.png`.

## Why (strategy)
Money-in (takings) + money-lost (waste) now sit side by side on a real dashboard, and cash-up variance is a shrink/error catch — all local-first, no till. Biggest perceived-value jump yet; makes [[Overview-Dashboard]] real on mobile ahead of the backend.

## Follow-ups
- Runner-up next: **fridge/chiller temperature log** (daily, compliance-sticky).
- When backend lands, takings/waste/inventory sync to v3 models; Owner glance can then add true margin from sales.

## Commit
- feat(app): day-takings + cash-up; Owner glance shows real numbers
