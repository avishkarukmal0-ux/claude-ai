# 2026-07-13 — Positioning pivot: theft/waste is the wedge, not wages

Back to [[Work-Log]] · [[Home]] · [[Positioning]]

**Domain(s):** [[Positioning]] · loss prevention · expiry

## Owner feedback on the 4 proposed priorities
1. "This Week" owner dashboard → **approved** ("good suggestion")
2. Wage-rise simulator → **rejected** — UK c-stores run on low wages, not a concern
3. Shrinkage/theft insights → owner asked "is it important?" → **YES, it's THE wedge** (see data)
4. "Waste £ saved" counter → **approved** ("good option")

## Evidence that theft is the lead wedge (ACS Crime Report)
- **£316m/yr** cost of crime to UK c-stores — **£6,000+ per store**
- **"10p crime tax" on every transaction**
- **6.2m** shop-theft incidents (record); robbery **+50.8%**; ~60% see rising organised crime
- Sector already spends **£265m/yr** on prevention (CCTV, body cams, screens)

## Decision
- **Lead the pitch with theft/shrinkage + waste**, not payroll/wages.
- Payroll/VAT remain in-product as **credibility/back-office depth** (moat vs AI clones), not the headline.
- Dropped the wage-rise simulator.

## Data availability (verified in code)
- Theft £: `models/ShrinkageLog.js` → `totalValue`, `occurredAt`, `type`, `status`. Endpoint `GET /loss-prevention/shrinkage`, plus `/loss-prevention/dashboard` (no-sales, patterns, incidents).
- Waste £ saved: `routes/expiryRoutes.js` `/dashboard` + markdown `/rules`.
- Sales/margin: reports + `/accounting/dashboard` (P&L, VAT, expenses MTD).

## Next
- Build flagship **"This Week" owner dashboard** combining priorities 1+2(theft)+3(waste). Awaiting owner decision on placement (landing screen vs new nav page).

## Changes (vault)
- Updated [[Positioning]]: ground-truth correction + reprioritised product list.
- This entry.
