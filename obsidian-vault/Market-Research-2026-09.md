# Market Research — is there a paying market for Vendora PWA? (2026-09-30)

Back to [[Home]] · Related: [[Work-Log/2026-09-30-Niche-Reassessment]] · pilot kit: `vendora-pos/pilot/`

Decision-grade research run (52 agents, adversarial verification) to test whether Vendora's PWA has a
viable, reachable, PAYING market before investing in Phase 2 backend.

## Verified findings
- **Market is large & was mis-measured.** UK has **~50,486 convenience stores** (ACS 2025); **~33,000–38,000
  are unaffiliated independents** (the rest are symbol/multiple). Google Maps result counts are NOT shop
  counts — the founder's "<20 newsagents in London" was a search artefact, not the market. *(high)*
- **B2B2C channel is real.** Bestway ≈70 depots serving **70,000+ retailers**; UK food/drink wholesale
  £33.6bn/yr, **£17.5bn (52%) to independents**. Booker built its own retailer app (**Scoot**) across all
  four symbol fascias. *(high)*
- **…but it converts SLOWLY.** Scoot reached only **~300 shops (~4% of Booker's symbol estate) in year 1 —
  despite being FREE and revenue-generating.** A paid back-office app pushed the same way should be expected
  to spread at least as slowly. "One wholesaler deal = hundreds of shops overnight" is **not** supported. *(high)*
- **Wholesalers may become competitors** (they'll own the retailer-app relationship). *(medium)*
- **Delivery is the dominant wholesale route** (58% value vs 40% cash-&-carry) — the delivery drop is exactly
  Vendora's goods-in touchpoint. *(high)*

## The decisive gap
**Willingness-to-pay for NON-till software is UNPROVEN** by any verified source — no evidence that UK
micro-retailers pay monthly for standalone inventory/ordering/waste/compliance tools, nor price points/churn.
This is the single most important question and only a real customer can answer it.

## Founder-market-fit (overrides the gap in importance)
Founder **worked in off-licences and convenience stores** and is confident owners will pay, and has **direct
access** (warm owner contacts + local walk-ins). Insider conviction + distribution access is precisely what
makes a hard-to-reach micro-retail market winnable — this is stronger evidence than the absent published data.

## Decision
- **Keep the niche** (convenience + off-licence). It's big and reachable.
- **Stop building; prove willingness-to-pay** with a small **direct paid pilot** using founder access, led by
  the three money-loss leaks the founder saw owners feel: **supplier credit, waste/expiry, over-ordering** —
  all already built.
- **B2B2C is the eventual scaling channel, not the validation channel** (too slow to validate with).
- Pilot success bar: **≥3 of 5 pilots pay £25/mo** and median money-found comfortably beats £25 → then resume
  Phase 2 + open B2B2C. Else pivot the *customer* (wholesaler-as-payer / adjacent vertical), not keep building.

## Caveats
Coverage was lopsided: per-niche counts for 11 of 12 niches were not verified (only convenience), and
competition/lock-in + adjacent-niche economics remain thin. Figures: ACS 2025, FWD 2023-24, Scoot Feb 2026.
Full raw output: `scratchpad/tasks/wp45cgiax.output` (session-local).
