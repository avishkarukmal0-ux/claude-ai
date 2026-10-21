# 2026-10-21 — POS / till sales-import foundation (slice 1 of a multi-slice build)

Back to [[Work-Log]] · [[Home]] · [[POS-Compatibility-Matrix]] · [[Sales-Ingestion-Design]] · [[Provider-Enquiries]]

**Domain(s):** [[Backend-Overview]] — new `services/posProviders/`; builds on `movementStore`/`inventoryStore`/
sync (stock model)
**Branch:** `claude/vendora-pos-v3-KPnI0`

Goal: foundation to receive completed **item-level** sales from nine POS/EPOS providers and (later, opt-in)
reduce stock without a second scan. This slice is the **safe, pure foundation** — no stock mutation, no faked
connections, no provider access needed. Larger slices (comparison mode, deducting CSV, cloud scaffolding, UI)
are planned in [[Sales-Ingestion-Design]].

## Inspected first (reuse map)
- Authoritative stock = `inventory_v1.qty` (offline-edited, per-item merge-synced, qty = opening +
  ledgerSum(movements ≤180d)). Ledger = `movements_v1` (typed, append-only, **`operationId` idempotency**,
  `batchId` reversals). Existing **`salesImportStore` CSV import is velocity-only — it does NOT deduct stock**.
- The brief's "auto-deduct from sales" is a *philosophy change* vs today's manual-count model → resolved as a
  per-shop mode defaulting to observe/velocity, with Comparison Mode as the opt-in on-ramp (see design doc).

## Built
- `backend/src/services/posProviders/`:
  - `salesModel.js` — shared normalized sale/line shape: **money in integer pence** (unknown ≠ 0), **decimal
    weighted quantities** with explicit unit, **stable dedupe keys** (`provider:merchant:saleId[:lineId]` →
    the future movement `operationId`), **returns kept separate** from sales, and `makeSale` issue-flagging
    (`unmatched`/`bad_qty`/`weighted`) + `isStockEligible` (completed + matchable + no blocking issue). Pure.
  - `registry.js` — provider **availability** catalogue (separate from a shop's connection status), grounded
    in public docs checked 2026-10-21, with `itemLevel`/auth/method/fees/blockers per provider.
  - `adapterBase.js` + `adapters/*.js` (nine) — adapter interface; **live ops (connect/fetchSales/
    verifyWebhook) throw "not available"** everywhere, `normalizeSale` throws until sandbox-verified. No faked
    endpoints.
- Tests: `posProviders.test.js` (16) — registry truthfulness, availability≠connection, SumUp unsupported for
  item-level, adapters reject honestly, sales-model numeric/dedupe/returns. **Fixtures only — no live provider.**
- Docs: [[POS-Compatibility-Matrix]] (matrix + sources + blockers), [[Provider-Enquiries]] (9 drafts, DO NOT
  SEND), [[Sales-Ingestion-Design]] (overlap resolution, single-source-of-truth, opening baseline/cut-off,
  idempotency, comparison mode, security, slice plan).

## Honest provider status (from current public docs)
- **Ready for testing** (documented item-level API; adapter buildable + sandbox-testable): Square, Shopify
  POS, Zettle, Epos Now.
- **Approval required** (partner/credentials unavailable): Lightspeed (access tier/fees unconfirmed),
  PayPoint One, ShopMate/RDP, EDGEPoS/Henderson.
- **Unsupported setup for item-level stock**: SumUp (payment/receipt totals only; a payment amount must never
  deduct stock — CSV item export is its only item-level route).
- **None verified live.** "Implemented" = framework + model + adapter stubs + unit tests with fixtures.

## Verification
- Backend boots clean; `posProviders.test.js` 16 green. Only NEW files added — no existing code changed, so
  other suites unaffected.

## Commit(s)
- `19aac2e` — feat(pos) foundation + docs.

## Follow-ups (next slices — none ship enabled without owner opt-in)
- [ ] Slice 2: read-only `GET /api/pwa-pos/providers` catalogue endpoint + phone-first "Connect your till"
      setup screen (honest statuses) + reuse `SalesImportView` for the CSV pilot.
- [ ] Slice 3: Comparison mode + deducting CSV path (opening baseline, cut-off, dedupe via operationId, returns).
- [ ] Slice 4: backend cloud scaffolding for the ready providers (OAuth/webhook-verify stubs, durable queue) — disabled.
- [ ] Slice 5: status/recovery screens, pilot-feedback capture, sandbox tests where available.
- [ ] Send provider enquiries (owner sign-off) to unblock the approval-required providers.
