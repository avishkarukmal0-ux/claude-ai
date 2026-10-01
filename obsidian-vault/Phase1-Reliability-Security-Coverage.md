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
| 1.1a | Distinguish "Saved on this phone" / "Waiting to sync" / "Synced" / failed | sync state machine `idle\|syncing\|synced\|offline\|error` + `pending` dirty count (`sync.js:61`); surfaced by `SyncStatus.jsx:19-47` — **but only when logged in**, so the accounts-off pilot (default `ACCOUNTS_ENABLED=false`, `account.js:35`) sees nothing | 🟡→ | Show a save indicator in the pilot: "Saved on this phone" (local-only) vs the synced states when signed in. Extend `SyncStatus` to render a local-only state when accounts off | indicator visible in pilot; states reflect real dirty/last-write |
| 1.1b | Never show success when persistence failed | `write()` falls back localStorage→IDB, only `{ok:false}`+`STORAGE_ERROR_EVENT` if both fail (`storage.js:194-219`); quota detected (`:164-169`); sync won't ack a blob whose local write failed (`sync.js:170,205-206,238-241`); `App.jsx:76-81` toast | ✅ | keep; add failed-save state into the indicator so it's not only a transient toast | indicator shows a persisted "couldn't save" state, not just a toast |
| 1.1c | Actionable errors + safe retries | auto debounced push + 60s poll + online/visibility retry (`sync.js:254-299`); 401 refresh-once (`:116-129`); role-rejected stores dropped (`:210`) | ✅ | minor: clearer per-cause copy | retry works; errors explain cause |
| 1.1d | Prevent duplicate records / stock movements on retry | `operationId` + `hasOperation` guard (`movementStore.js:117-122`); deliveries (`inventoryStore.js:534,582`), imports (`salesImportStore.js:214,240,252`); `recordMany` single persist (`movementStore.js:90-115`) | ✅ | — | re-apply writes no 2nd movement (scenario test) |
| 1.1e | Protect pending work: connection loss, SW update, session expiry | local-first; `flushDurable` on pagehide/hidden (`storage.js:415-427`); SW no-skipWaiting + Refresh prompt (`sw.js:23-32`, `pwa.js`); 401 refresh-once w/ session-match (`sync.js:116-129`) | ✅ | — | update never reloads mid-form; reopen keeps pending |
| 1.1f | Warn + handle pending changes before logout / switching accounts | `account.logout()` clears session only, **no dirty check, no flush, no confirm** (`account.js:129-134`); no `beforeunload` guard | 🟡→ | before logout/switch: `flushDurable()`, check `countDirty()`, confirm if unsynced; add a reusable guard | switching with unsynced work warns + flushes first |
| 1.1g | Handle conflicting edits from two devices without silently losing work | whole-store LWW by `mtime` + atomic CAS (`pwaSyncService.js:84-121`); client adopts server on loss (`sync.js:203-207`) — **loser's other-item edits in that store are discarded silently** | 🟡→ | on a losing conflict, keep a local recovery copy of the discarded blob + a user-visible notice; never silent | conflict keeps a recovery snapshot + notifies (test) |

## 1.2 Traceable stock movements

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 1.2a | Record deliveries/waste/returns/counts/adjustments consistently | one ledger, 7 frozen types (`movementStore.js:20-28`); all writes funnel through `recordMovement`/`recordMany`; wired for delivery/sale/waste/count/adjust/transfer | 🟡→ | wire `CUSTOMER_RETURN`/`SUPPLIER_RETURN` writers where returns exist (else document as N/A) | returns recorded as movements where the flow exists |
| 1.2b | Preserve source ref, actor, timestamp, quantity, reason | `at`, `delta`, `reason`, `operationId` (source) present; **`actor` accepted but never passed; `recordMany` can't carry it** (`movementStore.js:70-84,102-109`) | 🟡→ | thread `actor` (via `actor.js`/`stamp`) into `recordMovement`+`recordMany` and every caller | each movement row carries who did it (test) |
| 1.2c | Explain how current quantity was calculated | `qty` is an independent mutated field (`inventoryStore.js:96`); `stockStatus` only labels counted/calculated (`:211-217`); **no ledger-derived explanation, no history drilldown** | 🟡→ | per-product movement history view: running balance derived from the ledger, each row with actor/reason/source; flag ledger-vs-qty divergence | opening a product shows its movement history + how qty was reached |
| 1.2d | Corrections + reversals without deleting history | counts append a compensating `STOCK_ADJUSTMENT` (`inventoryStore.js:612-623`) ✅; **waste/sale/import undo DELETES rows via `removeByBatch`** (`movementStore.js:124-132`) | 🟡→ | replace reversal-by-delete with a compensating reversing entry (`reversalOf`), retaining the original | undo leaves both original + reversal in the ledger (test) |
| 1.2e | Prevent double application | `hasOperation` guard (delivery+import) ✅ | ✅ | — | — |
| 1.2f | Validate existing data before migrating | backup/restore validates (`backup.js:57-101`) ✅; **no ledger schema validation/versioning** (`movementStore.js:33-45`) | 🟡→ | validate ledger rows on load (drop/repair malformed, never crash); version the store | malformed row doesn't corrupt velocity/history (test) |

## 1.3 Backup and recovery

| # | Requirement | Existing evidence | Status | Change | Acceptance |
|---|---|---|---|---|---|
| 1.3a | Inspect/strengthen export/backup/restore | local engine `backup.js` v2, download/share, UI in More→Data (`HomePage.jsx:270-275`) | ✅ | — | — |
| 1.3b | Automatic server backups where architecture supports | **MISSING** — `SyncBlob` is one row/store, overwrite-in-place, `rev` is a CAS counter not history (`SyncBlob.js:11-22`, `pwaSyncService.js:84-121`) | 🔲→ | keep a capped ring buffer of the last N blob revisions server-side (behind `SYNC_HISTORY` flag); owner can restore a prior server version | a bad overwrite is recoverable from server history (test) |
| 1.3c | Show last successful backup | **MISSING** — no `lastBackup` stored anywhere; only last *sync* shown (`SyncStatus.jsx:29`) | 🔲→ | record `lastBackupAt` on export; show it in Data; distinguish from last-sync | Data shows when the user last exported |
| 1.3d | Validate restore files + preview effects | `readBackup` validates + rejects corrupt (`backup.js:61-102`); confirm shows per-store counts + date (`HomePage.jsx:95-97`) | ✅ | — | — |
| 1.3e | Atomic / recoverable restore | snapshot+rollback (`backup.js:116-149`); recovery copy auto-downloaded first (`HomePage.jsx:98`) | ✅ | — | interrupted restore rolls back (existing test) |
| 1.3f | Distinguish local exports from server backups | **MISSING** — "Synced" could read as "backed up" | 🔲→ | copy in Data + SyncStatus clarifying sync ≠ recoverable backup | UI states the difference |
| 1.3g | Document config / retention / recovery | **MISSING** | 🔲→ | add a Backup & recovery section to [[Deployment-Config]] | documented |

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
| Connectivity disappears mid-delivery | local-first write + dirty flag + resync; scenario test | ⏳ |
| A failed operation retried >once | idempotent `operationId`; scenario test | ⏳ |
| App closes & reopens with pending changes | `flushDurable`/`initStorage`; scenario test | ⏳ |
| Two devices edit the same record | LWW + **recovery copy + notice** (1.1g); test | ⏳ |
| Session expires while unsynced | refresh-once + dirty retained; test | ⏳ |
| PWA updates while a form is unfinished | SW no-skipWaiting + Refresh prompt | ✅ (existing) |
| Backup or restore interrupted | snapshot+rollback (`backup.test.js`) | ✅ (existing) |
| Staff attempts an owner-only action | role gate FE + backend 403/404 (integration) | ✅ (existing) |
| Access another shop's records/files | isolation integration suites | ✅ (existing) |
| Camera & notification permissions denied | Phase 3 (mobile) | 🔲 (Phase 3) |
| Product with different unit & case barcodes | Phase 2 (#7) | 🔲 (Phase 2) |
| A stock correction reversed without losing history | compensating reversal (1.2d); test | ⏳ |

## Feature flags & disablement
- `SYNC_HISTORY` (backend) — server-side blob version history (1.3b). Default **off**; when off, behaviour is
  exactly today's (latest-only). See [[Deployment-Config]].
- Shared-device purge (1.4f) is on by default (a security default); an explicit "keep me signed in on this
  device" choice preserves the cache intentionally.

## Phase gate status
- ⏳ **In progress.** Sub-areas delivered as reviewable commits (1.4 security → 1.1 status → 1.2 traceability
  → 1.3 backup), each with tests; this checklist updated as each lands.
</content>
</invoke>
