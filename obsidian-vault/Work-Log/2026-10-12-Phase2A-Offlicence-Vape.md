# 2026-10-12 — Phase 2A: Off-licence & Vape & CBD features

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Compliance-Phase0-1]]

**Domain(s):** refusals log, vape product-add block, vape product check, markdown warning, compliance data
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `30219c3`

First slice of Phase 2 (the brief's Group A). Shipped per the A/B/C/D cadence; B/C/D follow.

## Changes (no O fact hard-coded; every tool shows source + last-verified)
- **Refusals log** enhanced (`refusalsLog.js` + tool): staff **initials** field; **CSV export** (date/time/product/reason/staff/note) for an inspector; **weekly manager sign-off** (initials + date, stored in new `refusals_signoff_v1`) with a "review due" nudge when refusals are newer than the last sign-off; copy notes keep ~12 months. New store registered in `STORE_NAMES` + backup `STORE_SHAPE`.
- **Disposable-vape block at product-add** (`InventoryView` AddForm): when the category looks like a vape, the owner must answer "Rechargeable AND refillable, with a replaceable coil?" — **No blocks the save** ("Single-use vapes cannot be sold — illegal since 1 June 2025").
- **Vape product check** tool (new `VapeProductCheck`): nicotine ≤ 20 mg/ml, bottle ≤ 10 ml, tank ≤ 2 ml (limits in editable `VAPE_LIMITS`), plus "On the MHRA notified list?" (link) and a supplier-evidence toggle. Gated to age-check families.
- **Tobacco/vape markdown warning** (`WasteView`): marking down a nicotine line shows the reported 29 Oct 2026 discounting/free-distribution caveat — **warns, never blocks** (what "discounting" covers is unconfirmed).
- **Compliance data** (`data/compliance.js`): added reported TVA items (advertising ban 1 Jun 2027 provisional; flavour/display/licensing "date TBC") and a CBD novel-food checklist item (FSA public list; **no limits encoded** — decision pending). All with sourceUrl + confidence + lastVerified.

## Verification
- **FE 505/505 (+2) + build green.** New coverage: refusals CSV + sign-off; vape-check tool gating. **SW v18→v19.**
- **Not performed here:** live 375px/console re-audit — browser-only.

## What I could NOT verify / deliberately did NOT encode
- TVA commencement dates and the "discounting" definition are **reported/open** → data + warnings only, no blocking.
- CBD daily limits / THC limits **not encoded** (ministers hadn't decided as of 12 Oct 2026) — checklist + FSA link only.
- Disposable-vape detection keys off the category text (vape/e-liquid/nicotine); a vape filed under an unrelated category won't prompt — acceptable, flagged.

## Follow-ups
- [ ] Owner: redeploy Vercel (SW v19); re-audit Off-licence + Vape & CBD at 375px.
- [ ] Phase 2B (Fresh & weighed: weigh-and-label, beef/fish/produce fields, registration/rating) — next.
- [ ] Phase 2C (World & health-food) and 2D (Mobile & value) — after.
