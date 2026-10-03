# 🔬 Niche Gap Analysis — what we've missed, per niche (2026)

Back to [[Home]] · Related: [[Niche-Pain-Research]] · [[Features-To-Build]] · [[Implementation-Roadmap]] · [[Winning-Strategy]]

> **Per-niche gap research, 2026-09-16.** Four parallel research agents (one per family) checked each shop type against what Vendora already has and reported only **genuine gaps** — real compliance/money/time needs we don't yet cover. This note ranks them and picks the **surgical build set** (no bloat — fill gaps, don't pile on options). All fillers are local-first, no backend.

## The pattern: 5 cross-cutting gaps (best leverage — one build serves many niches)
| # | Cross-cutting gap | Serves | Why it matters |
|---|---|---|---|
| **1** | **Expiry / use-by / best-before dates + FEFO "sell first" list** | **Every family** | Legal hard-stop for pet meds & use-by meat/fish; biggest fresh money-leak; upgrades the waste tracker from *reactive* to *preventive* |
| **2** | **PPDS ingredient + allergen label generator** (Natasha's Law) | Fresh (bakery/deli/butcher), World (bulk repack), Health-food | Hard law since 2021; we print nothing; universally done wrong |
| **3** | **Loose price-per-kg + shelf-ticket generator** (weigh→price manual) | Greengrocer, butcher, deli, world (loose spices/grains) | Unit-pricing law (tightening ~Apr 2026); the defining feature a "weighed retail" app lacks |
| **4** | **Product-legality / compliance flags at goods-in** | Off-licence (MUP), vape (VPD/compliance), world (imported-stock), health-food (CBD, health-claims) | Several are *criminal offences*; catch before it hits the shelf |
| **5** | **Stock depletion + cash-up buckets** (count-back, pass-through money) | Market (count-back), discount (dead-stock ageing), grocery (PayPoint/lottery/top-ups) | We have no way for stock to go *down* without a till; cash-up reports false variance |

## Imminent (time-critical — both ~1 Oct 2026)
- **Vaping Products Duty (VPD)** — £2.20/10ml, duty stamps, sell-through window for pre-duty stock → **vape reprice tool + pre-duty flag**.
- **Wales MUP → 65p/unit** (1 Oct 2026; Scotland already 65p) → **MUP floor guardrail** (block/warn below floor; units = ABV × volume).

## Per-family specifics (ranked within family)
**Grocery & age-restricted:** VPD reprice ⏰ · cash-up pass-through buckets (PayPoint/lottery/top-ups — daily false variance) · MUP guardrail ⏰ · newspaper/mag sale-or-return credit recon (claim by 3pm) · rolling-DOB age check for tobacco (born ≥1 Jan 2009, from 2027) · lottery/scratchcard recon · CBD FSA-list check · vape compliance capture (nic/tank/refill/MHRA/reusable) · HND round ledger · PMP margin-squeeze flag · DRS 2027 (watch). *Myth killed: retailers do NOT scan tobacco track-&-trace on goods-in — only store EOID/FID.*

**Fresh & weighed:** loose price-per-kg + shelf tickets · PPDS labels · use-by + FEFO markdown · cut/yield & carcass breakdown costing (butcher) · fridge temp / SFBB diary · batch/lot traceability + recall pull-list · bake-to-demand · VAT hot/cold.

**World & specialist:** imported-stock "sellable in GB?" gate at goods-in (English label / UK importer address / allergens / origin) · health-claims guard vs GB NHC register (health-food) · PPDS/repack labels · CBD/novel-food gate · best-before/FEFO · festival stock-up planner (phased buy quantities) · Halal cert tracking (trust, not statutory) · landed cost (FX+freight+duty).

**Mobile & value:** pet veterinary-medicine expiry **hard-stop** (criminal offence) · discount dead-stock/sell-through ageing · market per-day cash-up netting pitch fee + pitch league table · market van count-back depletion · discount per-SKU VAT (if VAT-registered) · pet AAL welfare log (if live animals) · pet repeat/subscription feed reorders · street-trading licence reminder.

## The surgical build set — status (built 2026-09-16, see [[2026-09-16-Gap-Fills-1-4]])
1. ✅ **Expiry/date + FEFO "sell first" → waste** — built (best-before soft; use-by/medicine hard-stop "pull now").
2. ✅ **MUP guardrail + VPD reprice** — built (age-restricted quick tools).
3. ✅ **Cash-up pass-through buckets** — built (kills the false daily variance).
4. ✅ **Slow / dead-stock ageing + count-back depletion** — built (qty drop stamps lastSoldAt).
5. ⏸️ **PPDS / allergen label generator** — *deferred* (print-hardware dependent → later, as PDF/A4 output).
6. ⏸️ **Loose price-per-kg + shelf tickets** — *deferred* (same print/scale caveat).
7. ⬜ Niche-specifics next, as demand shows: cut/yield (butcher), sale-or-return (newsagent), festival planner (world), imported-stock legality gate (world), CBD/health-claims (health-food), fridge temp log, HND ledger, PMP flag.

*Reorder reason:* a phone can't reliably drive a label printer (esp. iOS), so print-dependent gaps dropped below the no-hardware wins.

## Caveats to honour (from the research)
- Dates that have slipped/are pre-final: unit-pricing (~Apr 2026), DRS (Oct 2027), VPD duty-stamp mechanics, tobacco DOB commencement, Allwyn settlement flow — **field-check before promising a date in-app.**
- A phone **can't read a scale** → weigh→price is manual entry / label generation, not scale integration.
- Loose-food allergen info = FSA **best practice**, not yet statute (PPDS *is* statute).
- Registers that change (GB NHC, FSA CBD list) fight "no backend" → bundle a dated snapshot + "verify on gov.uk" link.
- VAT features gate behind a "VAT-registered" toggle (£90k threshold); Halal = trust not law; "Not for EU" not a GB-wide rule.

## Sources
Captured in each agent's report this session (FSA, GOV.UK, ACS, VMD, Senedd/gov.scot, HMRC, Business Companion, trade press). Re-verify time-critical dates before building a countdown around them.
