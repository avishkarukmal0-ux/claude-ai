# Overview Dashboard → Owner Home ⭐

Back to [[Home]] · [[Domains-Index]] · Related: [[Positioning]] · [[Loss-Prevention]] *(n/a yet)* · [[Accounting]]

> The flagship screen that makes the [[Positioning]] visible in 5 seconds: leads with **£ lost to theft/shrinkage** and **£ of stock at risk to waste**, then sales & margin. First build reinforcing the "back-office OS for the corner shop" thesis.
>
> **As of 2026-07-16 this is the owner's landing screen** (see [[2026-07-16-Owner-Home]]) — reframed as "**Owner Home**": everything a stressed owner needs at a glance, to answer *making money today? money leaking? about to run out? is the shop OK?* and feel "it's fine".

## Owner Home layout (top → bottom)
1. **Shop status banner** — 🟢 "Everything's looking good" when nothing needs attention, else 🟠 "N things need a look" (taps to the Needs-attention list). The emotional payload — glance and breathe.
2. **Today so far** — takings (big) + trend **vs the same slice of the day one week ago** (fair like-for-like), sales count, staff on shift. Below it, an **End-of-day summary** CTA → `DaySummaryModal` (`GET /overview/daily-summary`): "Shop closed fine 👍" / "N things to check", takings + profit, a "worth a look" list, and **"Send to my phone"** (`navigator.share`, clipboard fallback) — see [[2026-07-16-Daily-Summary]].
3. **Theft** & **Waste** hero cards (the leaks).
4. **This week** — sales / gross profit / margin / transactions.
5. **Quick actions** — Open till · Cash up · Refund (`/pos?refund=1`) · Today's sales · Reorder stock.
6. **Needs attention** — chips linking to the relevant page.

**Landing rule:** `App.jsx` → `HomeRedirect` sends `hasRole('supervisor')` (owner/manager/supervisor) to `/overview`, cashiers to `/pos`.

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
- **Waste at risk:** £ expiring within **3 weeks** (`WASTE_WINDOW_DAYS = 21`) — the headline, so there's runway to sell/mark down — with an **urgent ≤7-day subset** (`WASTE_URGENT_DAYS`) called out, plus £ already expired. CTA → `/expiry`.
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
