# 2026-10-21 — POS deployment-audit fixes (P1 + P2)

Back to [[Work-Log]] · [[Home]] · responds to an external deployment audit (ran against `8cf6015`, slice 2)

**Domain(s):** [[Frontend-Overview]] · [[Integrations/Sales-Ingestion-Design]] · [[Domains/Inventory]]
**Branch:** `claude/vendora-pos-v3-KPnI0`
**Commit:** `609836c`

## Context
An external audit reviewed the deployment at `8cf6015` (slice 2). Several findings targeted code that still
exists at HEAD; I verified each against current code (not the stale line numbers) and fixed the real ones.
The audit's "comparison mode / deductions = design only" rows were already superseded by slices 3–5.

## Fixes

### P1 — history-only CSV imports could change stock on merge (FIXED)
Confirmed real: velocity CSV imports wrote plain negative `SALE` movements, and `mergeStore` reconstructs
`qty = opening + ledgerSum(movements)` counting them — so on a sync where the other device won, stock dropped
(repro: 10 → 8). Fix: a movement may now carry `evidence: true` (`movementStore.buildRecord`); velocity imports
set it; it is EXCLUDED from every quantity derivation — `mergeStore.mergeInventory` (both opening + merged
sums), `movementStore.movementHistory` running balance and `reconcileQty` — while still counting for velocity
(`salesUnits`/`velocity`/`topMovers`, which key off type). The opt-in deduction path (slice 3) omits the flag,
so real deductions still reconcile. One-time migration (`migrateImportedMovementsEvidence`) flags existing
non-deducted import movements, per workspace. Regression: `mergeEvidence.test.js` (audit repro + both merge
directions + balance/reconcile).
Files: `movementStore.js`, `mergeStore.js:155`, `salesImportStore.js` (velocity write + migration).

### P1 — conflict winner used a stale local mtime (FIXED)
Confirmed real for NON-merge stores: the LWW conflict branch read mtime from the pre-send `meta` snapshot, so a
newer in-flight edit was demoted to recovery instead of winning + staying dirty (recoverable, not total loss).
Fix: read fresh `loadMeta(ws)` in the conflict loop and decide on that. Regression added to `sync.test.js`
(non-merge store, send@100 / edit@300 / server-conflict@200 → v2 wins + stays dirty). The existing in-flight
test only covered a MERGE store, which is why this slipped through.
File: `sync.js:296,317`.

### P2 — salesModel fail-open hardening (FIXED; latent — adapters disabled)
- `makeSale`: an explicit unrecognised status (e.g. `pending`) → `'unknown'` + blocking `bad_status` issue
  (omitted still defaults completed). `REFUNDED`/`CANCELLED` already weren't eligible.
- `normalizeQty`: strict decimal — `'1e3'`/`'12x'` → null (were coerced to 13); currency/commas tolerated.
- `normalizeUnit` + `makeLine`: an unrecognised non-empty unit (e.g. `dozen`) → `unknown_unit` blocking issue
  instead of silently becoming EACH.
- `isStockEligible` blocks `bad_status`/`unknown_unit`.
File: `backend/.../salesModel.js`. Tests added to `posProviders.test.js`.

### P2 — CSV matching could attach a sale to the wrong product (FIXED)
A supplied-but-unknown barcode used to fall back to a NAME match (possibly a different same-named product), and
a duplicated name silently picked last-wins. Fix in `buildImport`: a supplied barcode MUST match a barcode (no
name fallback → unmatched/review); a name matches only when NO barcode is given AND it's unambiguous (exactly
one product). Regressions added to `sales-import.test.js`.
File: `salesImportStore.js`.

### P2 — honest wording (FIXED)
`TillConnectView`: "CSV import works now" → "Item-level CSV — check your export"; cloud badge for a
ready-for-testing provider "in testing" → "planned — not built yet" (adapters still throw). Importer info box
now notes barcode-first matching + the overlap caveat.

### P2 — overlapping-report dedup (DOCUMENTED, not faked)
Aggregate CSV carries no transaction/line IDs, so record-level dedup of an overlapping file is impossible from
that input — we don't claim it. Documented the limitation + mitigations in [[Sales-Ingestion-Design]] (identical
file still blocked; pick non-overlapping ranges; cloud/item-level feeds with stable IDs make dedup record-level
later). Surfaced in the importer copy.

## Not changed (audit items already addressed / out of scope)
- Comparison mode + opt-in deductions: built in slice 3 (audit ran pre-slice-3).
- Adapter honesty: locked by the slice-5 contract suite.

## Verify
- `npm run build` ✓ · full vitest **612 passed (85 files)** ✓ · backend boot ✓ · POS jest **70 passed**
  (posProviders, posAdapterContract, posCloud, secretBox) ✓. SW v69 → **v70**.

## Follow-ups
- [ ] The P1 evidence fix is unit-covered + reasoned for merge; worth a live two-device pass after the EU move.
- [ ] When an item-level/cloud feed lands, switch CSV dedup to transaction/line IDs (record-level).
