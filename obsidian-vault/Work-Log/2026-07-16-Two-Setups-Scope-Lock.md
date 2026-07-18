# 2026-07-16 — Two-Setups scope lock (Till + App) + code audit

Back to [[Work-Log]] · [[Home]] · [[Two-Setups-Till-and-App]]

**Domain(s):** [[POS-and-Checkout]] · [[Overview-Dashboard]] · [[Accounting]] · [[Domains-Index]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Decide, before writing any code, **what goes into the Till (web) vs the companion App (mobile)** — the "two setups" Vendora ships to each shop — and settle the payment model. User asked for a grounded, logical plan, not a surface split.

## What we did
- Opened **PR #1** (draft) for the branch — first PR ever for it; created a `main` base branch at the initial scaffold commit `e8eed5b` so there was something to diff against. Subscribed to PR activity; CI (Vercel) green; scheduled a silent hourly re-check.
- Ran a **3-way code audit** (subagents) to ground the split:
  - **Sale/payment foundation** — sale writes not atomic, not idempotent; loyalty-total bug (`saleRoutes.js:109-110`); card path is stub/simulation; Stripe only wired for SaaS billing; offline queue key mismatch; void-PIN bypassable by omission; Park is genuinely persisted.
  - **Inventory/goods-in** — `Supplier` already has a `cash-and-carry` type + price catalog; `Product` has cost/barcode/margin/`expiryBatches`; invoice-reader block is the reuse template; barcode lookup exists but 404s on unknown; PO-receive is all-or-nothing and doesn't update cost.
  - **Frontend map** — 35 pages classified Till/App/Both; found dead stub buttons in MarketIntel, fake void-PIN + toast-only Park in POS, hardcoded kiosk PIN in SelfCheckout; `QueueBustPage` is an existing roaming till; `StockTakePage` already camera-based.

## Locked decisions
1. **App does not sell** — payment stays on the till.
2. **Cash-&-carry = on-arrival confirm** (goods-in list → "Received" → stock+cost update).
3. **Stock-take → app.**
4. **Payments = Stripe Connect Express + Terminal reader**, `application_fee` = Vendora's margin; built after the sale foundation is atomic + idempotent.

Full reference: [[Two-Setups-Till-and-App]].

## Decisions / rationale
- App-doesn't-sell kills all Tap-to-Pay complexity → app is screens + scan only.
- Foundation fixes sequenced FIRST because real Stripe money can't sit on non-atomic/non-idempotent sale writes.

## Gotchas surfaced (promote to [[Conventions]] when we fix them)
- Every stock writer inlines `Product.$inc` + `StockMovement.create` — 5 copies, one (invoice-reader) forgets the movement. Extract `stockMovementService.receive()`.
- `Product.pricing.vatRate` is a string enum (`standard|reduced|zero`) while margin maths uses numeric 20/5/0 — resolve via the rule, not the field.

## Commit(s)
- _(docs commit for this plan; to be filled after push)_

## Follow-ups / next
- [ ] **Till foundation fixes** — atomic + idempotent sale (Mongo txn + clientRef dedupe), loyalty-total bug, offline queue key mismatch, void-PIN bypass. ← next up
- [ ] Stripe Connect Express + Terminal on the till.
- [ ] App scaffold (React Native) + goods-in scan + owner/worker views + suggest-to-owner + mobile stock-take.
- [ ] PR #1 still open/draft — keep watching CI.
