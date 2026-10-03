# 2026-10-02 — Review mandate Phase 2: guided buying journey + record-vs-send

Back to [[Work-Log]] · [[Home]] · follows [[2026-10-02-Review-Phase1-Crashes]]

**Domain(s):** Orders, Deliveries, Invoices, Claims, Credits
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Connect the buying journey (Order → receive delivery → check invoice → resolve discrepancy → claim →
confirm credit) as a guided workflow that REUSES the existing stores/screens — no duplicate screens.

## Key finding (from the pipeline map)
The stages were **already threaded by reference** — `delivery.orderId`, `claim.deliveryId/invoiceId/
supplierId`, reconcile stamps refs onto discrepancies, `claim.credits[].creditNoteId`. Idempotency guards
already exist (`inventoryStore.applyDelivery` keyed by `operationId = delivery.id`; credits idempotent per
note). So the journey is a **derive-only** layer — no new persistence.

## Changes
- **`src/lib/buyingJourney.js` (new, pure)** — `buildJourneys()` joins orders/deliveries/invoices/claims into
  per-purchase journeys with a 6-stage status model (order→delivery→invoice→resolve→claim→credit), the
  current stage, and the single next action (`go` = an existing `screen` key). Invoice stage is advisory
  (never nags/blocks completion); claim-vs-credit priority depends on whether the claim is still being
  chased. Helpers: `claimableIssues`, `claimsForDelivery/Invoice`, `hasClaimFor` (duplicate-claim guard).
- **`src/components/buy/BuyingJourneyView.jsx` (new)** — a glanceable stepper per purchase (in-progress first,
  then completed), carrying supplier/order/delivery/invoice refs, each CTA opening the existing screen.
- **`src/pages/HomePage.jsx`** — `journey` screen + a "Buying journey" tile at the top of the Buy hub
  (owner/manager only). `permissions.MONEY_SCREENS` now includes `journey`.
- **`src/lib/orderStore.js`** — **record vs send**: `createOrder({sent})`, `createDraftOrder` (a draft with
  `orderedAt: null` — recorded, NOT sent), `sendOrder(id)` (explicit, manual; never automatic).
- **`src/components/orders/OrdersView.jsx`** — a "Recorded — not sent yet" section with "Mark as sent" +
  "Share to supplier"; copy clarifies recording ≠ messaging the supplier.

## How requirements are met
- Current stage + next action → `buildJourneys().currentStage`/`nextAction`.
- Carry refs between stages → `journey.refs` shown on each card.
- Direct shortcuts kept → Buy-hub tiles unchanged; journey CTAs reuse the same screens.
- Partial deliveries / partial credits → stage detail (part-received; `£X still to receive`).
- Prevent duplicate stock movements → existing `operationId` guard (verified). Duplicate claims →
  `hasClaimFor` (wiring into create paths: next sub-step). Duplicate credit allocations → idempotent per note.
- Distinguish record vs send; never auto-send → orderStore draft/send; share is explicit.
- Allow delivery/invoice checking without an order → a delivery with no `orderId` yields an "Order: skipped
  (checked directly)" journey.

## Verification
- `src/lib/__tests__/buyingjourney.test.js` (14) + order record/send tests in `orders.test.js` (3 new).
- Full suite **303/303**; `npm run build` clean.

## Commit(s)
- (this commit) — feat(pwa): guided buying journey tracker + order record-vs-send (Phase 2)

---

# Phase 2b — duplicate-claim guard, reconcile order-awareness, first-use wording

## Changes
- **Duplicate claims prevented in BOTH create paths:** `ClaimsView` already filtered deliveries that already
  have a claim (`!claims.some(c => c.deliveryId === d.id)`); added the matching guard to the reconcile path
  in `InvoiceCaptureView.raise()` via `hasClaimFor(claims, {deliveryId, invoiceId})` — a toast blocks a second
  claim for the same delivery/invoice.
- **Reconcile order-awareness** (`reconcile.js`): now accepts an optional `order` and emits INFO-only
  (`order_short`, `order_price`) discrepancies comparing ordered qty vs delivered and agreed price vs
  invoiced. No `claimReason`, so they never add claimable amounts (no double counting). `InvoiceCaptureView`
  passes the linked order (`delivery.orderId`) into reconcile. Order qty is single-unit, so it lines up with
  the existing unit normalisation.
- **First-use** (`FirstRunCard`): the second action relabelled to the mandate wording "Check your first dated
  product" (the receive-first-delivery action + separated sample-data were already present from Phase 2.6).

## Verification
- `reconcile.test.js` +3 (order shortfall info / price info / no-order unchanged). Full suite **306/306**;
  build clean.

## Commit(s)
- (this commit) — feat(pwa): duplicate-claim guard + reconcile order-awareness + first-use wording (Phase 2b)

## Phase 2 status: complete
All Phase 2 mandate points addressed: guided journey, stage+next action, carried refs, shortcuts kept,
partial deliveries/credits, compare ordered/delivery/invoice with unit normalisation, check without an order,
duplicate movement/claim/allocation prevention, record-vs-send distinction, never auto-send, contextual
first-use, sample data separate.
