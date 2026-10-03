# 2026-10-01 — Invoice mandate P1.2: delivery ↔ invoice reconciliation → claims

Back to [[Work-Log]] · Builds on [[2026-10-01-Invoice-Mandate-P0-P1.1]]

Completes **Phase 1**: check a captured invoice against a received delivery and raise a claim through the
EXISTING claims workflow. No order required (order is optional context).

## New
- `lib/reconcile.js` (pure, tested): `reconcile({ delivery, invoice })`. Matches lines by productId →
  barcode → name; normalises pack sizes to single units; reports explained discrepancies:
  - **shortage** (billed > delivered → reason `missing`, short units × invoice £/unit),
  - **overcharge** (invoice £/unit > delivered/agreed £/unit → reason `wrong_price`, (billed−agreed) ×
    matched units; carries `unitBilled`/`unitAgreed` so the W8 editable agreed-price flows through),
  - **not_delivered** (invoice line with no delivery match → `missing`, full line value),
  - **pack_mismatch** / **extra_delivered** → INFO only (no claim).
  Shortage (missing units) and overcharge (delivered units) act on **disjoint** unit sets — no
  double-counting. Every discrepancy carries a `detail` string explaining its calculation. Plus
  `discrepanciesToClaimItems()` → claim-item shape.
- `claimStore.createClaim({ ...items })`: create a claim from pre-built items via the SAME lifecycle/shape
  as `createFromDelivery` (so reconciliation isn't a parallel path).
- `InvoiceCaptureView` → `ReconcileView`: from an invoice, pick a received delivery for that supplier, see
  claimable discrepancies (with explanations) + info notes, tick which to claim, and **draft a claim** that
  opens in Supplier claims for review/submit/follow-up. Reuses `useDeliveries` + `useClaims`.

## Consistency / no double-apply
Reconciliation only READS deliveries + invoices and CREATES a claim draft — it never re-applies stock
movements or invoice values. Stock stays owned by delivery receiving; claim values by the claims store.

## Verification
FE **161/161** (+7 reconcile: normalisation, shortage, overcharge, disjoint no-double-count, not-delivered,
extra-delivered info, claim-item mapping). Build clean.

## Commit
`feat(pwa): delivery↔invoice reconciliation → claims (P1.2)`
