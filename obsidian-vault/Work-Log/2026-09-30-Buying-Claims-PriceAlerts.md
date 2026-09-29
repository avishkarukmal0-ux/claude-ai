# 2026-09-30 — Stage 5: Buying lifecycle, supplier claims & price alerts

Back to [[Work-Log]] · Related: [[2026-09-30-Delivery-Receiving]] · [[2026-09-30-Expiry-Batches]]

## Goal
Close the buying loop: order → receive against order → recover credit for bad goods → react to
cost changes. Reuse the buy list, suppliers and Stage-2 deliveries (with their evidence photos).

## What shipped
- **5a Orders** (`orderStore` + `OrdersView`): lifecycle draft→ordered→partially_received→
  received/cancelled (status derived from fulfilment). "Place order" turns a supplier group of the
  buy list into a tracked order; reorder suggestions **subtract incoming** (on-order) stock so they
  don't duplicate. A delivery can be **linked to an order** — receiving records accepted units
  against it without double-counting stock.
- **5b Claims** (`claimStore` + `ClaimsView`): raise a claim from a received delivery's claimable
  issues, pulling in evidence photos; amounts prefilled from affected qty × price paid. Lifecycle
  draft→submitted→acknowledged→approved|rejected→settled (legal transitions only). Tracks
  **requested vs approved vs received** credit, credit-note ref + follow-up date. Share is explicit
  — never auto-sent.
- **5c Price alerts** (`priceAlertStore` + `PriceAlertsView`): a material per-unit cost change
  (≥5% & ≥1p) on receiving queues an alert with margin impact + a suggested retail to hold the old
  margin; purchase-cost history preserved. **Retail only changes on owner approval**, never auto.

## Verification (actual)
- Vitest: 4 order + 3 claim + 4 price-alert tests; full FE suite **64/64**.
- E2E (headless Chromium 390×844, prod build): order → partial (1/5) → received; damaged delivery
  → claim → submitted → approved → settled (requested £2, received £2). No page errors. Build clean.

## Data preserved
Additive: scoped keys `orders_v1`, `claims_v1`, `price_alerts_v1` (backed up + migrated); optional
`costHistory` on products. No records altered; incoming/receiving never double-counts stock; retail
never auto-changed.

## Remaining
Stage 6 staff tasks/handover · Stage 7 IA cleanup · later additions. Heavy infra (auth accounts,
IndexedDB, multi-device sync) still open — documented in [[ADR-002-App-Till-Separation]], not faked.

## Commits
`feat(app): purchase order lifecycle (Stage 5a)` ·
`feat(app): supplier claims + purchase-price change alerts (Stage 5b/5c)`
