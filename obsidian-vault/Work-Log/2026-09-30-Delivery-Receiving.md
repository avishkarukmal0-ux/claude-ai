# 2026-09-30 — Stage 2: Delivery receiving & discrepancies

Back to [[Work-Log]] · Related: [[2026-09-30-Reliability-Review]] · [[ADR-002-App-Till-Separation]]

## Goal
Build the #1 shop workflow — **receive & check deliveries** — end to end, local-first, reusing the
existing goods-in/movements/suppliers rather than duplicating. Start after confirming the Stage-1
reliability work from the review is present.

## Stage-1 gap closed first
- `movementStore`: added **`transfer`** type; enriched `recordMovement` with `operationId`
  (idempotency), `unit`, `location`, `actor`; added `hasOperation()` dedupe guard.

## What shipped
- **`deliveryStore`** — drafts (autosaved on every edit → interruption-safe) + received history;
  pure, unit-tested helpers for cases↔units (`3 × 24 = 72`) and per-unit cost (`caseCost ÷ pack`);
  `deliveryTotals` with discrepancy count; **repeat-previous-delivery** (cloned to a draft for review).
- **`inventoryStore.applyDelivery()`** — adds **accepted** units to stock, updates **purchase cost only**
  (retail price never auto-changed), logs one `goods_received` movement per line with the delivery id as
  `operationId`, and is **idempotent** (re-submit → `{duplicate:true}`, no double count). Unknown barcodes
  are created.
- **`DeliveryReceivingView`** (Scan tab) — supplier + reference, scan/type lines, units-or-cases with
  explicit pack size + live conversion, ordered/delivered/accepted, missing/damaged/extra/wrong-price
  issue chips, per-line note + **downscaled evidence photo**, partial acceptance, duplicate-safe Receive,
  drafts list + recent deliveries with Repeat. The old flat `GoodsInView` was removed (superseded).

## Verification (actual)
- Vitest: **8 new delivery tests**, full FE suite **43/43**.
- E2E (headless Chromium, 390×844, prod build): 3 cases of 24 with 1 damaged → **48 units** into stock,
  **£0.50/unit** cost, **retail price null (untouched)**, `goods_received` movement w/ operationId,
  delivery `received` with the damage issue, Repeat drafts a new delivery. No page errors.
- `npm run build` clean.

## Data preserved
Additive only. New scoped key `deliveries_v1` (in `STORE_NAMES` → backed up + migrated). No existing
records touched. Costs updated from delivery; retail prices left alone.

## Remaining (next stages, not built this pass)
Stage 3 quick counts + locations + refill/transfer (transfer type is ready) · Stage 4 batches ·
Stage 5 order lifecycle + supplier claims (evidence photos already captured) + price alerts ·
Stage 6 staff tasks/handover · Stage 7 IA cleanup. Heavy infra still open: real PWA auth accounts,
IndexedDB migration, multi-device sync (documented in [[ADR-002-App-Till-Separation]] — not faked).

## Commit
`feat(app): delivery receiving & discrepancies (cases, partials, drafts, idempotent)`
