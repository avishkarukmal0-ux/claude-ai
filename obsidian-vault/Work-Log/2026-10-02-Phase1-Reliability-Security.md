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

## Follow-ups
- 1.1 save/sync status, 1.2 traceability, 1.3 backup/recovery — next commits (see checklist).
</content>
