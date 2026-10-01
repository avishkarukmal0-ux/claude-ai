# 2026-10-02 — Phase 1: Data reliability & security

Back to [[Work-Log]] · Checklist: [[Phase1-Reliability-Security-Coverage]] · [[Deployment-Config]]

A fresh reliability/security mandate (PWA-only). **Goal:** harden data reliability + security without
rebuilding what already exists. Started with four read-only audits mapping each Phase 1 requirement to the
actual code (file:line) — most of Phase 1 was already built to a good standard; this work closes the
*verified* gaps. Full requirement→evidence map in [[Phase1-Reliability-Security-Coverage]].

Delivered as reviewable, per-area commits (1.4 security → 1.1 status → 1.2 traceability → 1.3 backup),
each with tests + checklist update.

## 1.4 — Shop & staff security ✅
**Gaps found (not rebuilt — already solid: backend scoping on every route/job/notification, roles, secrets
server-side, cross-shop tests).**
- **Shared-device cache leak (key gap):** logout/switch never purged the shop's on-device data, so another
  person on a shared phone could recover `vendora:shop:<id>:*` from localStorage/IndexedDB.
  - `storage.purgeWorkspace(ws)` — wipes every `vendora:<ws>:*` key from MEM + localStorage + IndexedDB
    (incl. local-only invoice scans + per-workspace sync-meta). New `idb.delByPrefix`.
  - `account.logout({ purge = true })` purges the departing shop by default; `activate()` purges a
    *previous different* shop on account-switch (device handover); re-login as the same shop keeps its cache.
  - `lib/session.js` (new) — `signOut()` orchestrates flush → final sync → purge (sits above account+sync
    to avoid an import cycle); `pendingCount()`, `flushAndSync()`.
  - `AccountView` now has a signed-in panel + safe sign-out: warns about unsynced changes, offers "keep this
    shop's data on this device" (personal phone), else removes it (shared phone).
- **Revocation didn't bite on the data path:** a deactivated member's existing access token kept syncing
  until expiry (only login/refresh/me re-checked).
  - `pwaAuthService.assertMemberActive()` re-checks member active/role against the DB on the sync + notify
    routes, adopts the **live role** (role change bites immediately too), 30s TTL cache invalidated on
    member admin writes (`invalidateMember`). Owner tokens skip the DB entirely.
  - Wired into `pwaSyncRoutes` + `pwaNotifyRoutes` gates (now async).

### Verification (1.4)
- FE **230/230** (+5: storage purge ×2, account logout-purge/keep/switch/same-shop). Build clean.
- BE pure suites pass (`pwaStoreAccess`, `money`, …); backend app loads. New DB-gated case in
  `pwaSync.integration`: deactivated member's existing token → 401 on `/pull` (runs on `VENDORA_TEST_URI`).
- Pre-existing: the till/back-office DB suites (`products`, `sales`, …) fail without Mongo in the sandbox —
  unrelated to these changes; PWA integration suites skip cleanly without a URI.

## 1.1 — Save & sync status ✅
**Already solid:** write-failure detection (localStorage→IDB fallback, `STORAGE_ERROR_EVENT`), safe auto-
retries, `operationId` idempotency, SW update prompt. **Gaps closed:**
- **Pilot had no status:** `SyncStatus` only rendered when logged in, so the accounts-off pilot saw nothing.
  New `saveStatus.js` (device-save state from the storage events) + `SaveSyncStatus.jsx` show "Saved on this
  phone" always, with the sync line beneath when signed in. Rendered in More→Settings for every mode.
- **Failed save was only a toast:** `saveStatus` now holds a persistent per-store "couldn't save" state
  (cleared when that store next saves), shown in `SaveSyncStatus` — not just a disappearing toast.
- **Logout/switch pending work:** handled by `session.signOut()` (flush + final push, reports `remaining`
  unsynced) + the AccountView sign-out warning (from 1.4).
- **Silent conflict loss (key):** `conflictBackup.js` stashes the losing local value on BOTH conflict paths
  in `sync.js` (pull-over-dirty + push-conflict); sync state gains a `conflicts` count + `CONFLICT_EVENT`;
  `HomePage` toasts; new `ConflictRecovery` screen (More→Data→Recovered changes) lets the owner review,
  download, and clear their replaced copies. Nothing is lost silently.

### Verification (1.1)
- FE **235/235** (+5: sync conflict-recovery ×2, saveStatus ×3). Build clean.

## 1.2 — Traceable stock movements ✅
**Already solid:** one typed 7-type ledger, delivery/import `operationId` idempotency, append-only count
corrections. **Gaps closed:**
- **Actor on every row:** `movementStore` now has a shared `buildRecord()` used by `recordMovement` +
  `recordMany` that stamps `actor`/`actorId`/`actorRole` from the signed-in member ("Owner" for guest).
  Previously `actor` was accepted but never passed and `recordMany` couldn't carry it.
- **Reversals keep history:** new `reverseByBatch()` appends a compensating `STOCK_ADJUSTMENT` tagged
  `reversalOf` instead of deleting; `reverseWaste`/`reverseBatchWaste` switched to it. `removeByBatch` is
  retained only for sales-import undo (re-importing the same file must stay possible).
- **"How did this qty get here?":** `movementHistory()` (running balance from the ledger) + `reconcileQty()`
  (opening balance vs recorded) power a new `ProductHistory.jsx`, reached from a History button on each
  Stock row — every change with who/when/why + balance, and an honest opening-balance line.
- **Validate before use/migrate:** `sanitizeMovements()` drops structurally-invalid rows on every load so a
  corrupt record can't crash velocity/history or be carried forward.
- **Returns (honest):** no PWA returns workflow exists, so `CUSTOMER_RETURN`/`SUPPLIER_RETURN` stay reserved
  (not inventing a screen). `ProductHistory` renders them if ever recorded.

### Verification (1.2)
- FE **239/239** (+4 new movement tests; 2 undo tests updated to assert retained history). Build clean.

## Follow-ups
- 1.3 backup/recovery — next commit (see checklist).
</content>
