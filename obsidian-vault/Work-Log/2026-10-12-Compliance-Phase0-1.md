# 2026-10-12 — Compliance rebuild Phase 0 + Phase 1 (sourced review)

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Compliance-Fixes]]

**Domain(s):** compliance data layer, onboarding, niche config, quick tools (MTD/MUP/Vape/Age/Margin), demo data, Today nudges
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `9fa2cdf`

Big sourced review arrived as a multi-phase brief. Instruction: do Phase 0 + Phase 1, deploy, report before Phase 2. Research dated 2026-10-12; facts tagged V/R/O. Ground rules: R facts as editable DATA (one file), never hard-code O, every tool shows "last verified + source", never claim to "handle" compliance.

## Phase 0 — structure
- **New `src/data/compliance.js`** — the single rules data file (ground rule 2). Every item: `{id, name, text, sourceUrl, confidence:'verified'|'reported', lastVerified, nations[], families[], date?|ongoing?, note, requiresMtd?}`. `config/compliance.js` is now just the filter/sort layer (MTD gate + nation gate). (Used `.js` not `.ts` — codebase is JS.)
- **Onboarding questions** (`businessProfile` + NichePicker): nation, entity, turnover band, **50+ employees?**, **sell live animals?** (mobile-value), **import food directly?** (world/fresh), **cultural-festival reminders?** All stored locally, tri-state yes/no.
- **Per-group demo data** (`demo.js`): each group loads its own catalogue — fresh-weighed (sourdough/mince/loose apples/brie), world-specialist (basmati/dates/spice/paneer + "Import Wholesale" supplier), mobile-value (dog food/charger/kitchen roll/litter), grocery-age (unchanged). Member swaps: e-liquid for Vape & CBD, wormer for Pet shop. No more bread/milk/cola for everyone.
- **Per-niche nudges/tools**: "Date-code the milk & chilled" dropped for Vape & CBD; **festival nudges owner-selectable** (`festivalsEnabled` — world-specialist default on, others off, owner override). Vape-duty off Off-licence and MUP off Vape & CBD were already gated (member `hideForMembers`).

## Phase 1 — correct what exists
1. **MTD** — already gated to qualifying sole traders (>£50k Apr 2026 / >£30k Apr 2027; £20k not encoded); "MTD-ready" welcome copy already removed.
2. **Vape duty** — copy now: paid upstream, reaches you via supplier prices; unstamped stock sellable to 31 Mar 2027; stamps from 1 Apr 2027. Output labelled **"estimated pass-through, not a duty you owe"**; input "incl. VAT"; "no margin added". Stamp countdown in Compliance radar.
3. **Age check — rebuilt** product-aware (alcohol/vape/tobacco) + nation-aware: Scotland prompts under-25 (mandatory); England/Wales/NI Challenge 25 is an optional "my licence requires it" toggle; tobacco adds the reported born-on/before 31 Dec 2008 generational test (editable `AGE_RULES` + "confirm commencement"). Future DOB → "Invalid date"; >110 → "Check this date"; no negative ages.
4. **MUP** — Scotland & Wales 65p (Wales uplift 1 Oct 2026 already handled); tool shows "No MUP in your nation" for England/NI; default jurisdiction from the profile; Off-licence card relabelled "Minimum unit price".
5. **Margin calc** — rejects negative cost ("Cost can't be negative"); loss formats −£0.20; "Enter a sell price" on empty/zero.
6. **Takings** — money-field wrappers raised to ≥44px (disabled-Save hint already added).
7. **Price Marking Order** — data item (all nations) + **`lib/priceMarking.js`** (`unitPrice`/`priceLabel`, VAT-inclusive + per-kg/L/100g/100ml). See "could not verify".

## Verification
- **FE 502/502 (+7 new) + build green.** New: `niche-compliance` (demo-per-group, festivals, profile, unit price); extended `compliance-gating` (data-shape + nation gate). **SW v16→v17.**
- **Not performed here:** live 375px / desktop / console checks — browser-only (no Playwright).

## What I could NOT verify / did partially
- **PMO display rollout** — the `priceMarking` helper + data item are in, but applying VAT-inclusive + unit-price labels across *every* price display is not done yet (cross-cutting; queued). Flagged, not silently claimed.
- **"3rd milk unit vanished / £ at risk 7.35→2.40"** — needs reproduction in a browser; not investigated yet.
- **Niche resolution** is distributed across quickTools/todaySignals/demo/shopTypes rather than one `{group,tools,nudges,demoData,onboardingQuestions}` object — same effect, no single resolver yet.
- All **O** facts (CBD limits, penalties, exact commencement dates) are NOT encoded — shown as "check with…" notes only.

## Follow-ups
- [ ] Owner: redeploy Vercel (SW v17), re-audit at 375px + desktop + console.
- [ ] Phase 2 (new per-group features) — await go-ahead.
