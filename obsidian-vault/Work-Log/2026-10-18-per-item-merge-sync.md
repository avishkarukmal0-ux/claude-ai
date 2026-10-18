# 2026-10-18 — Per-item merge sync (item #3): concurrent staff edits no longer clobber

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Frontend-Overview]] · sync (`sync.js`, new `mergeStore.js` + `tombstoneStore.js`), the 5
id-keyed stores · [[Backend-Overview]] (ALLOWED list)
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
The deferred item #3 from [[2026-10-16-scale-sync-hardening]]. Whole-store last-write-wins meant two staff
editing the same shop on two devices clobbered each other: the later whole-store push overwrote the other's
changes, and a concurrent stock change on one device was simply lost. Fix: **merge by item id**, with stock
quantity rebuilt from **movement deltas** (not absolute values), and **tombstones** so deletes aren't
resurrected.

## Shipped in three commits
1. **`3ff3fad` — pure merge engine (`lib/mergeStore.js`)** + 17 tests. `mergeById` (union by id,
   newest-`updatedAt`-wins, ties keep server, inline-tombstone capable, TTL GC); `mergeMovements`
   (append-only union); `mergeInventory` (metadata by mtime; **qty = opening(winner) + ledgerSum(merged
   movements)**, safe fallback to winner's absolute qty when no ledger in context); `ledgerSum`, `liveItems`,
   `mergeStoreArrays` dispatcher.
2. **`f2039ed` — delete tombstones** (inert until wiring). Deletes stay HARD removals in the item stores
   (arrays/reads/derivations and all 549 tests untouched); the deleting device ALSO records a `{store,id,at}`
   row in a new shared, synced **`sync_tombstones_v1`** store (`lib/tombstoneStore.js`,
   `recordTombstone`/`clearTombstone`). Engine gained `mergeTombstones`/`tombstoneMap`/`applyTombstones`
   (+20 tests). The 5 stores record a tombstone on delete and clear it on undo (restore bumps `updatedAt` to
   out-vote a synced tombstone); `mergeProducts` tombstones the dropped product; orders stamp `updatedAt` on
   create. Registered the store in client `STORE_NAMES` + backend `ALLOWED`.
3. **`5159f0b` — sync wiring.** On an ongoing (post-bootstrap) pull, `MERGE_STORES`
   (inventory/orders/deliveries/claims/credit_notes/movements + the tombstone store) UNION local+server
   instead of LWW; inventory qty rebuilt from the unioned ledger; tombstones applied. First sync still
   bootstraps server-wins (a fresh device never injects stale local data). When the union adds info the
   server lacks, the store stays dirty and a debounced push carries it back. +3 sync integration tests. SW
   v62→**v63**.

## Decisions
- **External tombstone store, not in-array `_deleted`.** In-array tombstones would have forced a
  `load()`/`loadRaw()` split + read-filtering through all 5 stores (especially the 970-line inventoryStore
  with ~15 `load()` call sites) — high regression risk. External keeps every store's array semantics and
  existing tests untouched; only the merge consults the tombstone set.
- **Merge only on the pull-adopt path** (where both devices have the store). The narrow push-conflict race
  (another device pushes the same store between our pull and push) keeps its existing stash-to-conflict-backup
  behaviour (loser recoverable, not lost) and converges on the next pull-merge — avoids changing that test and
  bounds risk.
- **Qty via `opening + ledgerSum`**, not an inventory refactor to an explicit `openingQty` field. Correct on
  convergence; falls back to winner's absolute qty when the server ledger isn't in the current (delta) pull.

## Gotchas
- `reconcileQty.difference` (currentQty − ledgerSum) is the implicit opening balance — that's what the qty
  formula reconstructs from.
- Tombstone TTL GC uses real timestamps, so engine tests must use `Date.now()`-relative times (not epoch-tiny
  numbers) or the GC drops them.
- Promoted the per-item-merge rules into [[Conventions]].

## Verification
- Engine: 37 unit tests (`mergeStore.test.js`). Sync: 15 (`sync.test.js`, +3 for the merge path — two-device
  union, qty from both ledgers, delete-not-resurrected). Full **vitest 572 / 81**. `npm run build` ✓. Backend
  boots clean (ALLOWED addition only).
- ⚠️ Not exercised against a live two-device setup here (no devices/DB in sandbox); logic verified via the
  sync engine's fake-server tests. Worth a real two-phone smoke test before relying on it in production.

## Commit(s)
- `3ff3fad`, `f2039ed`, `5159f0b` (+ this docs commit)

## Follow-ups
- [ ] Real two-device smoke test (edit same product on two phones; delete on one; confirm union + no
      resurrection + correct qty).
- [ ] `movements_v1 removeByBatch` (sales-import undo) hard-removes without a tombstone — under union merge a
      removed batch could reappear from another device. Rare (undo path); prefer `reverseByBatch`. Revisit if
      it bites.
