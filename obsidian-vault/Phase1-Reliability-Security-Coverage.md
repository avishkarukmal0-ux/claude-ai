# Phase 1 — Data Reliability & Security: Coverage Checklist

Back to [[Home]] · [[Work-Log/Work-Log]] · [[Deployment-Config]] · routes [[Backend/API-Routes]]

Living map of the **Phase 1 reliability & security mandate** → existing implementation (with file:line
evidence) → change → acceptance. Status: ✅ done · 🟡 partial/gap · 🔲 to build · ⏳ in progress.
Paths are under `vendora-pos/`. Verified against the actual code (four read-only audits, 2026-10-02) —
**not** assumed. This is a harden-and-close-gaps programme: most of Phase 1 already exists to a good
standard; this checklist records what was genuinely missing and how it was closed.

Rule from the mandate: *verify gaps against the actual implementation; reuse existing stores; avoid
duplicate screens and parallel implementations; do not present mock data as complete.*

---

## 1.1 Clear save and sync status

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 1.1a | Distinguish "Saved on this phone" / "Waiting to sync" / "Synced" / failed | was only shown when logged in; now `saveStatus.js` + `SaveSyncStatus.jsx` always show a device-save line ("Saved on this phone"), with the sync line beneath it when signed in. Rendered in More→Settings for every mode incl. the accounts-off pilot | ✅ (1.1) | — | **done** — `savestatus.test.js`; pilot now has a status |
| 1.1b | Never show success when persistence failed | `write()` localStorage→IDB fallback, `{ok:false}`+`STORAGE_ERROR_EVENT` only if both fail (`storage.js`); sync won't ack a blob whose local write failed (`sync.js`); PLUS `saveStatus` now holds a **persistent** "couldn't save" state per store (cleared when that store saves again), surfaced in `SaveSyncStatus` — not just a transient toast | ✅ (1.1) | — | **done** — `savestatus.test.js` (persistent failure, per-store clear, de-dupe) |
| 1.1c | Actionable errors + safe retries | auto debounced push + 60s poll + online/visibility retry (`sync.js:254-299`); 401 refresh-once (`:116-129`); role-rejected stores dropped (`:210`) | ✅ | minor: clearer per-cause copy | retry works; errors explain cause |
| 1.1d | Prevent duplicate records / stock movements on retry | `operationId` + `hasOperation` guard (`movementStore.js:117-122`); deliveries (`inventoryStore.js:534,582`), imports (`salesImportStore.js:214,240,252`); `recordMany` single persist (`movementStore.js:90-115`) | ✅ | — | re-apply writes no 2nd movement (scenario test) |
| 1.1e | Protect pending work: connection loss, SW update, session expiry | local-first; `flushDurable` on pagehide/hidden (`storage.js:415-427`); SW no-skipWaiting + Refresh prompt (`sw.js:23-32`, `pwa.js`); 401 refresh-once w/ session-match (`sync.js:116-129`) | ✅ | — | update never reloads mid-form; reopen keeps pending |
| 1.1f | Warn + handle pending changes before logout / switching accounts | `session.signOut()` flushes durable writes + attempts a final push, returns `remaining` unsynced; `AccountView` sign-out panel warns about unsynced work before purging and offers "keep on this device" (1.4) | ✅ (1.1) | — | **done** — sign-out flushes + final-syncs; warns on unsynced; `session.js` + AccountView |
| 1.1g | Handle conflicting edits from two devices without silently losing work | whole-store LWW by `mtime` + atomic CAS (`pwaSyncService.js`); now `conflictBackup.stashConflict()` keeps the losing local value (both pull-over-dirty and push-conflict paths in `sync.js`), surfaces a `conflicts` count + `CONFLICT_EVENT`; `HomePage` toasts; `ConflictRecovery` screen lets the owner review/download/clear | ✅ (1.1) | — | **done** — `sync.test.js` conflict-recovery ×2 (pull + push paths), copy preserved, event fired |

## 1.2 Traceable stock movements

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 1.2a | Record deliveries/waste/returns/counts/adjustments consistently | one ledger, 7 frozen types; all writes funnel through `recordMovement`/`recordMany`; wired for delivery/sale/waste/count/adjust/transfer | 🟡 (honest) | — | **done for the flows that exist.** Returns (`CUSTOMER_RETURN`/`SUPPLIER_RETURN`) have no PWA workflow yet (the till owns refunds; the PWA has no returns screen), so no writer is wired — the types are reserved and `ProductHistory` renders them if ever present. Not inventing a returns screen (mock features don't count) |
| 1.2b | Preserve source ref, actor, timestamp, quantity, reason | `at`, `delta`, `reason`, `operationId` present; now `buildRecord` captures `actor`/`actorId`/`actorRole` on EVERY row (signed-in member, "Owner" for guest) for both `recordMovement` and `recordMany` (`movementStore.js`) | ✅ (1.2) | — | **done** — `movements.test.js`: every row carries an actor |
| 1.2c | Explain how current quantity was calculated | new `movementHistory()` (running balance from the ledger) + `reconcileQty()` (opening balance vs recorded) + `ProductHistory.jsx` reached from the Stock list (History button): every change with who/when/why + balance, and an honest "opening balance + movements = current" line | ✅ (1.2) | — | **done** — `movements.test.js` history/reconcile; UI wired in `InventoryView` |
| 1.2d | Corrections + reversals without deleting history | counts already append corrections; now `reverseByBatch()` appends a compensating `STOCK_ADJUSTMENT` (`reversalOf`) instead of deleting, and `reverseWaste`/`reverseBatchWaste` use it (`movementStore.js`, `inventoryStore.js`). `removeByBatch` kept only for sales-import undo (must allow re-import) | ✅ (1.2) | — | **done** — `movements.test.js` reverseByBatch (kept+idempotent); `inventory`/`batches` tests assert history retained |
| 1.2e | Prevent double application | `hasOperation` guard (delivery+import) ✅ | ✅ | — | — |
| 1.2f | Validate existing data before migrating | `sanitizeMovements()` drops structurally-invalid rows on every `load()` (unknown type, non-finite/zero delta, bad timestamp), so a corrupt row can't crash velocity/history or be written forward (`movementStore.js`) | ✅ (1.2) | — | **done** — `movements.test.js` sanitize |

## 1.3 Backup and recovery

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 1.3a | Inspect/strengthen export/backup/restore | local engine `backup.js` v2, download/share, UI in More→Data (`HomePage.jsx:270-275`) | ✅ | — | — |
| 1.3b | Automatic server backups where architecture supports | new `SyncBlobHistory` collection records every committed revision when `SYNC_HISTORY` is on (capped `SYNC_HISTORY_KEEP`, TTL `SYNC_HISTORY_TTL_DAYS`); `pwaSyncService` `listHistory`/`getHistoryVersion`/`restore`; routes `GET /history`, `GET /history/:name/:rev`, `POST /restore`; client `cloudBackup.js` + `CloudBackups.jsx` (owner/manager) | ✅ (1.3) | — | **done** — `pwaSyncHistory.integration`: bad overwrite restored from a prior revision; `cloudbackup.test.js` client |
| 1.3c | Show last successful backup | `backup.getLastBackupAt()` records a device-level timestamp on each successful export; shown on the Export row (More→Data) | ✅ (1.3) | — | **done** — `cloudbackup.test.js` records export time |
| 1.3d | Validate restore files + preview effects | `readBackup` validates + rejects corrupt (`backup.js:61-102`); confirm shows per-store counts + date (`HomePage.jsx:95-97`) | ✅ | — | — |
| 1.3e | Atomic / recoverable restore | snapshot+rollback (`backup.js:116-149`); recovery copy auto-downloaded first (`HomePage.jsx:98`) | ✅ | — | interrupted restore rolls back (existing test) |
| 1.3f | Distinguish local exports from server backups | `SaveSyncStatus` copy ("Cross-device sync keeps your other devices up to date. For a restore point, use Export backup"); `CloudBackups` + docs state sync ≠ recoverable backup | ✅ (1.3) | — | **done** — UI + [[Deployment-Config]] Backup & recovery table |
| 1.3g | Document config / retention / recovery | [[Deployment-Config]] — Backup & recovery section (4 levels, sync≠backup, retention, operator enable + verify) + flag table rows | ✅ (1.3) | — | **done** |

## 1.4 Shop and staff security

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 1.4a | Enforce ownership/permissions on backend for every record/doc/job/notification | token-gated + account-scoped on every PWA route; role gate + `FINANCIAL_STORES` on sync; `ownerGate` on staff; shared-secret on `/run`; digests built per-account only (`pwaSyncService.js`, `pwaAuthService.js`, `pwaNotifyService.js`) | ✅ | — | — |
| 1.4b | Test cross-shop access attempts | `pwaIsolation.integration`, `pwaSync.integration`, `pwaAuth.integration`, `pwaStoreAccess` (pure) | ✅ | add existing-token-after-deactivation case (see 1.4e) | — |
| 1.4c | Reuse existing auth patterns | JWT `typ:'pwa'` + bcrypt; roles owner/manager/staff (`Member.js`) | ✅ | — | — |
| 1.4d | Keep credentials/secrets server-side | only bcrypt hash stored; never emitted; keys from env (`pwaAuthService.js:35-44`, `pwaNotifyService.js:20-22`) | ✅ | — | — |
| 1.4e | Revoke staff access + invalidate sessions | deactivation cut login/refresh/me only; now `assertMemberActive()` re-checks member on the **data path** (sync + notify), adopts the live role, 30s TTL cache invalidated on member admin writes so it bites on the next request (`pwaAuthService.js` assertMemberActive/invalidateMember; `pwaSyncRoutes.js`, `pwaNotifyRoutes.js` gates) | ✅ (1.4) | — | **done** — `pwaSync.integration`: deactivating a member → their existing token gets 401 on `/pull` without refresh |
| 1.4f | Prevent another account seeing cached data on a shared device | `purgeWorkspace(ws)` wipes `vendora:<ws>:*` from localStorage+MEM+IDB (`storage.js`; `idb.delByPrefix`); `logout({purge=true})` + account-switch in `activate()` purge the departing shop; `session.signOut()` flushes + final-syncs first; AccountView sign-out panel warns about unsynced + offers "keep on this device" | ✅ (1.4) | — | **done** — `storage.test.js` purge; `account.test.js` logout-purges / keep / switch-purges / same-shop-keeps |

---

## Acceptance scenarios (Phase 1)

| Scenario | Where covered | Status |
|---|---|---|
| Connectivity disappears mid-delivery | local-first write + dirty flag + resync | ✅ `phase1-scenarios.test.js` (offline→reconnect) |
| A failed operation retried >once | idempotent `operationId` guard | ✅ `movements.test.js` / `scenarios.test.js` D5 |
| App closes & reopens with pending changes | `flushDurable` on hide + `initStorage` restore | ✅ `idb-durability.test.js` / `storage.test.js` |
| Two devices edit the same record | LWW + **recovery copy + notice** (1.1g) | ✅ `sync.test.js` conflict-recovery ×2 |
| Session expires while unsynced | refresh-once + dirty retained | ✅ `phase1-scenarios.test.js` (session expiry) |
| PWA updates while a form is unfinished | SW no-skipWaiting + Refresh prompt | ✅ (existing) |
| Backup or restore interrupted | snapshot+rollback (`backup.test.js`) | ✅ (existing) |
| Staff attempts an owner-only action | role gate FE + backend 403/404 (integration) | ✅ (existing) |
| Access another shop's records/files | isolation integration suites | ✅ (existing) |
| Camera & notification permissions denied | Phase 3 (mobile) | 🔲 (Phase 3) |
| Product with different unit & case barcodes | Phase 2 (#7) | 🔲 (Phase 2) |
| A stock correction reversed without losing history | compensating reversal `reverseByBatch` (1.2d) — original kept + reversal appended | ✅ (1.2) |

## Feature flags & disablement
- `SYNC_HISTORY` (backend) — server-side blob version history (1.3b). Default **off**; when off, behaviour is
  exactly today's (latest-only). See [[Deployment-Config]].
- Shared-device purge (1.4f) is on by default (a security default); an explicit "keep me signed in on this
  device" choice preserves the cache intentionally.

## Phase gate status
- ✅ **Phase 1 complete.** All four sub-areas delivered as reviewable commits, each with tests + checklist +
  Work-Log updates:
  - **1.4 security** (`f321872`) — shared-device purge on logout/switch; prompt staff revocation on the data path.
  - **1.1 status** (`3b30383`) — pilot save indicator; persistent failed-save; no silent conflict loss + recovery.
  - **1.2 traceability** (`f464164`) — actor on every row; compensating reversals (history kept); per-product
    history + reconciliation; ledger validation.
  - **1.3 backup** (`7a18815`) — opt-in recoverable server version history + restore; last-backup indicator;
    sync≠backup clarity; docs.
- **Verification:** FE **244/244** (vitest); BE pure suites pass + DB-gated integration (auth/roles, sync
  role-access + prompt revocation, cross-tenant isolation, server version-history restore) run on
  `VENDORA_TEST_URI`; build clean; backend loads. The pre-existing till/back-office DB suites still require a
  live Mongo (unrelated to this work).
- **Production deployment intentionally left to the operator** (mandate: do not deploy). `SYNC_HISTORY` is the
  one new flag, default off; everything else is additive/safe-by-default. See [[Deployment-Config]].
</content>
</invoke>
