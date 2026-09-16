# Positioning Strategy ⭐

Back to [[Home]] · Related: [[Domains-Index]] · [[Accounting]] · [[Competitor-Teardown]]

> **Core thesis:** Vendora is **not a card reader with a shop attached**, and **not a generic AI POS clone**. It is the **back-office operating system for the UK independent convenience store** — the compliance + margin + payroll depth a symbol-group BDM and an accountant would give you, without the symbol-group contract.

## The one-liner
> **"The complete back office for the UK corner shop — till, payroll, VAT, margins, waste and theft in one system built for how a convenience store actually makes (and loses) money."**

## Why now — the market reality (July 2026)
- UK c-store **net margins ~4.3% and falling** for a decade; independent sales **down 3.8–4.7% YoY**.
- **National Living Wage → £12.71** (Apr 2026), ~**+£900/yr per full-time worker**. Labour is the #1 cost squeeze.
- **Theft/shrinkage rising** — cited as a top threat; self-checkout loss growing.
- **71% of stores are independent** (symbol or unaffiliated); **unaffiliated independents run below benchmark margins** and lack the "managed EPOS" perk symbol groups dangle.
- Admin overhead is brutal: one retailer went from **5 hrs/month on data → minutes** with a good EPOS.

**Implication:** the buyer's pain is not "I need to take card payments." It's **"my margin is vanishing to theft, waste and admin."** Whoever owns *that* problem wins the corner shop.

### ⚠️ Ground-truth correction (from owner, 2026-07-13)
- **Wages are NOT the wedge.** UK c-stores already run on low/minimum wages (family labour, part-time) and are *not* anxious about wage-rise cost. → **Dropped the "cost of a wage rise" simulator.** Payroll/VAT stay in-product as **credibility + back-office depth** (moat vs AI clones), not as the headline.
- **Theft/shrinkage IS the lead wedge.** ACS Crime Report: **£316m/yr cost of crime, £6,000+ per store, a "10p crime tax" per transaction, 6.2m thefts, robbery +50.8%,** and stores already spend **£265m/yr** on prevention. This is the expensive, emotive, daily pain.
- **Lead order:** Theft/shrinkage → Waste → Margin/ordering. Payroll/VAT = proof of depth, not the pitch.

## The competitive landscape
See [[Competitor-Teardown]] for detail. Summary of where everyone sits:

| Player | What they really are | Gap they leave |
|---|---|---|
| **Square / SumUp / Zettle** | Payments-first, generic, cheap | Shallow back office; no UK payroll/VAT/compliance depth |
| **Shopify POS** | Omnichannel *online+store* retail | Built for DTC/brands, not corner-shop P&L or compliance |
| **Epos Now** | Horizontal EPOS + hardware + 12-mo contract | Generic across verticals; upsell-heavy; not c-store-specialised |
| **Lightspeed** | Mid-market retail/hospitality | Overkill + pricey for a single c-store |
| **Generic "AI POS" clones** (SmartPOS AI, vibe-coded startups) | Horizontal cart + payments + dashboard, AI-flavoured | **Shallow.** Can't replicate UK statutory payroll math, VAT100, HFSS/age, shrinkage, margin logic |
| **Symbol groups** (Nisa/Premier/Londis/Spar) | Buying group + *managed* EPOS as a membership perk | Requires joining the group; not for the unaffiliated 71% |

## The moat: depth an AI clone can't shortcut
"Anyone can vibe-code a cart." **Nobody accidentally vibe-codes correct UK statutory logic.** Our defensibility is *regulatory + domain correctness*, already built (see [[Domains-Index]]):
1. **UK payroll engine** — PAYE bands, NI (Ee/Er), pension auto-enrolment, **NMW compliance flagging**, payslip PDFs. Directly answers the wage-cost crisis. → [[Accounting]]
2. **HMRC accounting** — VAT100 nine-box returns, expenses, P&L, margins — in the till.
3. **Compliance built in** — **Challenge 25 / age verification**, HFSS-aware, audit logging.
4. **Loss prevention & shrinkage** — incident/shrinkage tracking, scan-pattern anomaly detection — the rising-theft pain.
5. **Waste & margin defence** — **expiry markdown rules**, smart reorder, supplier invoice OCR, market intel — protect the thin 4.3%.

A generic AI competitor would need to *know* HMRC rules, ACS guidance, NLW figures, HFSS law — not just prompt "build me a POS." That knowledge gap is the moat.

## Ideal customer profile (ICP)
- **UK independent convenience stores**, 1–5 sites.
- **Unaffiliated independents first** (below-benchmark margins, no symbol-group EPOS, most underserved) — then small symbol members wanting better back office.
- Owner-operator who does payroll/VAT/ordering themselves at night and hates it.

## How to message it
- **Lead with the P&L, not the till.** "Stop losing your margin to wages, waste and theft."
- **Proof over features:** "Runs your April payroll with the new £12.71 NMW, files your VAT, flags shrinkage — automatically."
- **Anti-positioning vs AI clones:** "Built by people who know UK retail law, not a generic AI cart. Your VAT and payroll have to be *right*."
- **Anti-positioning vs symbol groups:** "Symbol-group back office, without joining a symbol group."

## Product priorities that reinforce positioning
Rank future work by how much it deepens the *back-office / compliance moat* (hard to copy) over shiny-but-generic POS features (easy to copy). **Reprioritised after owner feedback 2026-07-13:**
1. ⭐ **Owner "This Week" dashboard** — lead with **£ lost to theft/shrinkage** and **£ saved from waste/markdowns**, then margin & sales trend, on one screen. Makes the positioning visible in 5 seconds. *(APPROVED — flagship build.)*
2. ⭐ **Proactive shrinkage/theft insights** — surface anomalies, high-risk lines, incident cost, not buried in a report. *(The lead wedge — £6k/store/yr pain.)*
3. ⭐ **"Waste £ saved" counter** from expiry markdowns — quantify money returned. *(APPROVED.)*
4. Keep VAT/payroll **provably correct & current** with UK tax-year updates — credibility/depth, not headline.
5. ~~Payroll "cost of a wage rise" simulator~~ — **DROPPED.** Owner: UK c-stores run on low wages, not a concern.

## Pricing & revenue model — TWO streams (validated 2026-07-16)
> Evolution from the original "bring your own acquirer" line: Vendora now *also* offers optional low-rate card processing via **Stripe Connect** and earns a per-transaction margin (`application_fee`). See [[Two-Setups-Till-and-App]] and the validation note [[2026-07-16-Pricing-and-Margin-Validation]].

### Stream 1 — SaaS subscription (£29/59/99) — VALIDATED as realistic
Sits in the **mid-band** of the UK market and holds up:
- Paid EPOS peers: **Epos Now ~£25–39**, **Shopify POS Pro ~£69/location**, **Lightspeed ~£75–189**. Vendora's £29/59/99 lands cleanly among them.
- **The real threat is the £0-software players** — Square / SumUp / Zettle charge **nothing** for software and earn entirely on processing. Against them, £29/mo must be *visibly* justified by the back-office depth (payroll, VAT, theft/waste), not by the till.
- **Verdict:** keep the tiers. Use SaaS as the **land grab** — modest, undercut paid clones, out-*depth* the free ones. Price it against *"cheaper than an afternoon a week of the owner's time + one avoided compliance mistake,"* never against a free card reader.

### Stream 2 — payment processing margin (Stripe Connect) — VALIDATED, but conditional
Scales with the shop's takings → the **profit engine**. But the margin math is brutally sensitive and rests on **one dependency**. See the full worked calculator: **[margin calc artifact](https://claude.ai/code/artifact/b763651f-9212-404e-b9a7-a5428cb5c981)**.

**Base case:** £6.50 avg basket, £20,000/mo card turnover ≈ **3,077 transactions/mo**. Sell to shop at a flat **1.5%**.

| Stripe cost mode | Cost to Vendora | Revenue @1.5% | **Margin/store/mo** |
|---|---|---|---|
| **Standard** (1.4% + 10p) | £587.70 | £300 | **−£288 (LOSS)** ❌ |
| **Interchange++** (~0.5% + 4p) | £223 | £300 | **+£77 (+0.39%)** ✅ |

- **The killer number is the fixed per-transaction fee.** Break-even basket = **fixed fee ÷ your % spread**. On Standard that's **~£100** — no corner shop's basket clears it, so every small sale loses money. On IC++ it's **~£4** — which real c-store baskets clear.
- ⚠️ **The entire payment business case depends on getting Stripe Interchange++ pricing.** On Stripe's public/standard rate the model is *dead*. This is the single thing to validate with Stripe before building.
- **Spread room is segment-specific:** vs Square (1.75%) / SumUp / Zettle there is **little-to-no room** on small baskets — they're already cheap and take the processing risk. The genuine room is vs **legacy / locked-in acquirers** (Worldpay-style, bundled terminal rental, 18-mo contracts) — the actually-gouged segment. Target *them*, not shops already on Square.
- **Fleet scaling** (IC++, base case): 100 stores ≈ **£7.7k/mo** (overtakes SaaS at £5.9k); 500 stores ≈ **£462k/yr**. The margin only becomes the profit engine *at fleet scale*.

### Both streams — anti-lock-in stays the wedge
- Processing is **optional, no contract, cancel anytime** — capture the margin without becoming Epos Now. "Cheaper card rates, leave whenever" beats a 12-month contract.
- **Regulatory reality (validated):** taking an `application_fee` via Stripe Connect **destination charges** — where funds never route through a Vendora-controlled account — most likely keeps Vendora **out of FCA authorisation scope** (Commercial Agent Exclusion, PERG 15). If Vendora ever *holds* funds before paying the shop, that changes. Keep funds flowing shop-direct.

## Differentiation in an AI-clone-saturated market (2026-07-16)
The flood of vibe-coded AI POS clones *helps* us — they cluster in the shallow end (cart + payments + dashboard). Win by out-**depth**, not out-feature:
1. **Reliability is the differentiator.** Owners forgive a missing feature, never a double-charge / lost offline sale / wrong VAT. Half the clones are flaky → "Vendora just works with my money" is a claim they can't cheaply make. **The till foundation fixes are credibility, not plumbing.**
2. **Anxiety-reduction is hard to copy** — owner "fingertip" dashboard, nightly "shop closed fine" WhatsApp, worker→owner suggestions. Needs domain depth to know what an owner actually frets about.
3. **Companion app + cash-&-carry scan** ties into the supplier/margin engine — another thing a clone must rebuild correctly.

## What-else priorities (ranked by moat, not shine)
1. **Painless migration/onboarding** — import from old EPOS/spreadsheet in minutes. Switching cost, not price, is the #1 barrier; killing it wins deals clones can't.
2. **"Provably correct UK tax" as a living guarantee** — auto-update every tax year (NLW/NI/VAT). A reason to keep paying; moat widens yearly.
3. **Network-effect benchmarking** — "you lose 2× more to waste than similar shops near you." Needs fleet data; no single-store clone can offer it.
4. **Human touch** — be the symbol-group BDM replacement (onboarding help + responsive support) without the group contract.
5. **Advertise offline-proof reliability** as a feature, not a fixed bug.

## Risks / watch-outs
- Incumbents (esp. Epos Now) could add UK payroll — keep widening the compliance depth.
- Must stay **current with UK tax years** or the credibility moat inverts into a liability. See [[Conventions]].
- Don't dilute into generic omnichannel — that's Shopify's game, not ours.

## Open questions to validate with real retailers
- Is *payroll* or *shrinkage* the sharper wedge to lead with?
- Unaffiliated independents vs small symbol members — who converts faster?
- Willingness to switch from an existing symbol-managed EPOS?
