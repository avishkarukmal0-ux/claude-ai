# 2026-07-16 — Pricing & Payment-Margin Validation

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Positioning]] · [[Two-Setups-Till-and-App]] · [[Competitor-Teardown]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Take the SaaS tiers and the Stripe payment-margin idea "into a real position" — validate both against current (2025–26) UK market figures, then compute the actual payment margin rather than hand-waving it.

## What we validated

### SaaS tiers £29 / £59 / £99 — realistic, keep them
- Mid-band of the paid UK EPOS market: **Epos Now ~£25–39**, **Shopify POS Pro ~£69/location**, **Lightspeed ~£75–189**.
- Real competitive threat is **£0-software players** (Square / SumUp / Zettle) who charge nothing for software and earn on processing. £29/mo must be justified by back-office depth, not the till.
- Verdict: tiers are correctly placed. SaaS = land-grab wedge, kept modest.

### Payment margin (Stripe Connect `application_fee`) — works ONLY on Interchange++
Base case: **£6.50 basket, £20,000/mo card turnover ≈ 3,077 txns/mo**, sell to shop @ flat **1.5%**.

| Stripe cost mode | Cost | Rev @1.5% | Margin/store/mo |
|---|---|---|---|
| Standard 1.4%+10p | £587.70 | £300 | **−£288 LOSS** |
| Interchange++ ~0.5%+4p | £223 | £300 | **+£77 (+0.39%)** |

- **Break-even basket = fixed fee ÷ % spread.** Standard ⇒ ~£100 (dead — no c-store basket clears it). IC++ ⇒ ~£4 (works).
- Fleet (IC++): 100 stores ≈ £7.7k/mo (overtakes SaaS £5.9k); 500 ≈ £462k/yr.
- Spread room exists vs **legacy/locked-in acquirers**, NOT vs Square/SumUp/Zettle on small baskets.

### Regulatory (FCA / PERG 15)
- Stripe Connect **destination charges** (funds never route through a Vendora-controlled account) most likely keep Vendora **out of FCA authorisation scope** via the Commercial Agent Exclusion. Holding funds before paying the shop would change that. Keep funds shop-direct.

## Decisions
- **Keep £29/59/99.** No change.
- **Payment model is GO — but conditional on securing Stripe Interchange++ pricing.** On standard pricing it is not viable for c-store baskets. This is the one thing to validate with Stripe before building the Connect integration.
- Target the **gouged legacy-acquirer segment**, not shops already on Square.

## Gotchas
- The whole payment case hinges on the **fixed per-transaction fee**, not the percentage. A 10p vs 4p fixed fee is the difference between −£288 and +£77/store. Promote to [[Conventions]] if we build pricing logic.
- Research was gathered via **WebSearch** — the environment proxy blocks WebFetch (403 CONNECT) to external sites, so direct source-fetch deep-research returns zero claims here. Use WebSearch for market figures.

## Artifacts
- Interactive margin calculator: https://claude.ai/code/artifact/b763651f-9212-404e-b9a7-a5428cb5c981
- Strategy brief: https://claude.ai/code/artifact/4f43c62b-6238-4760-abec-2169e30594ca

## Commit(s)
- `docs:` this note + [[Positioning]] revenue-model rewrite (hash on push)

## Follow-ups
- [ ] Contact Stripe re: Interchange++ eligibility for the platform — **blocks the payment build**.
- [ ] Till-foundation fixes still precede any real Stripe work (see [[Two-Setups-Till-and-App]] blocker list).
