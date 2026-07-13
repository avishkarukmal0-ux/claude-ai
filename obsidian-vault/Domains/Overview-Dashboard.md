# Overview Dashboard ("This Week") ⭐

Back to [[Home]] · [[Domains-Index]] · Related: [[Positioning]] · [[Loss-Prevention]] *(n/a yet)* · [[Accounting]]

> The flagship screen that makes the [[Positioning]] visible in 5 seconds: leads with **£ lost to theft/shrinkage** and **£ of stock at risk to waste**, then sales & margin. First build reinforcing the "back-office OS for the corner shop" thesis.

## Where it lives
| Layer | File |
|---|---|
| Page | `frontend/src/pages/OverviewPage.jsx` |
| FE service | `frontend/src/services/overview.js` |
| Route (FE) | `/overview` in `App.jsx` — `requireRole supervisor` |
| Nav | top "Overview → This Week" section in `components/Sidebar.jsx` (supervisor+) |
| Route (BE) | `backend/src/routes/overviewRoutes.js` → mounted `/overview` |
| Endpoint | `GET /api/overview/this-week` (supervisor) |

## What it shows (all real data, last 7 days)
- **Theft & shrinkage:** £ lost (sum `ShrinkageLog.totalValue`), WoW trend, incident count, open cases, and a "per-sale crime tax" (£ lost ÷ transactions).
- **Waste at risk:** £ expiring ≤7 days (recoverable via markdown) + £ already expired, with counts. CTA → `/expiry`.
- **Sales & margin:** revenue (WoW trend), gross profit, margin %, transaction count — via `reportService.getMarginAnalysis`.
- **Needs attention:** chips for open incidents, pending scan patterns, expired/expiring lines — each links to the relevant page.

## Data sources
- `models/ShrinkageLog` (`totalValue`, `occurredAt`)
- `models/Incident` (open/investigating), `models/ScanPattern` (pending)
- `models/Product.expiryBatches` + `pricing.retailPrice` for waste
- `services/reportService.getMarginAnalysis(store, from, to)` for sales/margin
- `models/Sale` count for transactions

## Design intent
- Trend colouring is semantic: for **theft** a rise is **bad** (red); for **sales** a rise is **good** (green). See `Trend` component.
- Two hero cards (theft red, waste amber) dominate — the positioning wedge.
- Placement chosen as a **nav page** (owner feedback) — can be promoted to the **post-login landing** for owners with a one-line change to the `index` route in `App.jsx`.

## Follow-ups
- [ ] Optional: make this the owner landing screen (flip `index` redirect by role).
- [ ] Add "waste £ actually recovered" once markdown *sales* are logged (today we show at-risk/recoverable, which is honest).
- [ ] Sparklines / 4-week trend.
