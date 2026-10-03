# 2026-09-14 — "Today at the shop" + Compliance Radar (all niches)

Back to [[Work-Log]] · Related: [[2026-09-14-Quick-Tools]] · [[Go-To-Market]] · [[Winning-Strategy]]

## Goal
Turn Vendora from a tool-you-remember into a **habit you open every morning** — a per-family "Today at the shop" glance — plus a UK-shop **Compliance Radar**. Founder ask: make it work **across all niches**, not just grocery.

## What changed (files)
- 🆕 `frontend/src/lib/dateUtils.js` — shared date helpers (startOfDay, daysUntil, formatUK, isLastFriday).
- 🆕 `frontend/src/config/calendar.js` — seasonal/demand events (Diwali, Christmas, Eid…) tagged by family + `upcomingEvents()`.
- 🆕 `frontend/src/config/compliance.js` — UK compliance items (MTD, SA, NLW, VAT, VPD, DRS, tobacco T&T, alcohol licence, Natasha's Law, Weights & Measures, imports, market licence) tagged by family + `complianceForFamily()`.
- 🆕 `frontend/src/lib/todaySignals.js` — `buildTodaySignals(familyId)`: blends nearest deadline + nearest event + weekend/payday + a rotating per-family nudge → top 4.
- 🆕 `frontend/src/components/home/TodayAtShop.jsx` — the morning card (greeting + tailored signals).
- 🆕 `frontend/src/components/quicktools/ComplianceRadar.jsx` — per-family deadlines (countdowns) + always-on obligations.
- ✏️ `quickTools.js` — registered Compliance radar (universal). ✏️ `HomePage.jsx` — TodayAtShop at top of Home tab; **modal made scrollable with sticky header** (bug fix, see below).

## Bug fixed (caught in verification)
Tall tool content (Compliance Radar) overflowed the bottom-sheet and pushed the close button off-screen. Modal now `max-h-[88vh]` with a sticky header + scrollable body.

## Cross-niche verification (headless Chromium, 4 families)
- **Off-licence:** Today = "VPD in 17 days" + "Diwali in 55 days" + nudge; tools include **Age check**; radar has VPD/DRS/tobacco/alcohol licence.
- **Butcher:** Today = "Waste check…"; **no** Age check; radar has **Natasha's Law + Weights & Measures**.
- **World grocer:** Today = "Diwali…" + "allergen labels"; radar has **Imported food safety**.
- **Market trader:** Today = "Flag slow sellers…"; radar has **Market/street trading licence**.
- `npm run build` ✓; no page errors. Screenshots in scratchpad.

## Why (strategy)
"Today" manufactures the **daily-open habit** the land plan needs before goods-in ships; Compliance Radar is a pure **trust** builder no indie shop gets elsewhere. Both are 100% offline/no-backend and fully niche-aware.

## Follow-ups
- Later: let shops set their real cash-&-carry / returns days (personalise the weekday nudges); confirm compliance dates as rules firm up; add remaining creative ideas (voice/photo capture, handover notebook, cash-up, invite-a-shop).

## Commit
- feat(app): "Today at the shop" + Compliance Radar, tailored per shop family
