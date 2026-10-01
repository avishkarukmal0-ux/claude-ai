# 2026-09-30 — Infra Stage 3: cross-device sync

Back to [[Work-Log]] · Related: [[2026-09-30-PWA-Accounts-Stage2b]] · [[2026-09-30-IndexedDB-Durability]] · [[Backend/API-Routes]]

## Goal
Make the "log in on another device and see your shop" promise real — the thing the account copy used to
call "coming soon". Keep the app local-first: local data is always authoritative for reads; sync runs in
the background and reconciles. Scoped to the PWA account (ADR-002); the till is untouched.

## Model
Per-store push/pull with a server revision (`rev`) + client modified-time (`mtime`). Each store is the
opaque JSON string the client already keeps — the server versions it, never parses it.
- **PULL** adopts any store the server has at a higher rev than we've seen.
- **PUSH** sends dirty stores; server fast-forwards when `baseRev` matches, else resolves a genuine
  concurrent edit **last-write-wins by mtime**, returning the loser as a `conflict` to adopt.
- **First sync on a device = safe bootstrap:** the server WINS for any store it already has, so a freshly
  logged-in device can never clobber the shop's existing cloud data. Purely-local stores the server lacks
  are uploaded. (Guest→shop migration stays separate + explicit.)

## Backend (always mounted, no till dependency)
- `models/SyncBlob.js` — `{ account, name, value, rev, mtime }`, unique on `(account, name)`.
- `services/pwaSyncService.js` — `pull`/`push`. Guards: allowed store names only (mirror of client
  STORE_NAMES), ≤2 MB per store, ≤40 changes/push. All queries scoped to the token's account id.
- `routes/pwaSyncRoutes.js` — `GET /api/pwa-sync/pull`, `POST /api/pwa-sync/push`; both require a
  `typ:'pwa'` access token (reuses `pwaAuthService.verifyAccess`). Mounted in `routes/index.js`.
- Body limit already 10 MB (`app.js`); CSP `connect-src` already allows the Render API host — no config change.

## Client
- `lib/storage.js` — new `STORAGE_WRITE_EVENT` fired on every successful scoped write/remove, so the sync
  engine learns which store changed (decoupled; storage stays framework-free).
- `lib/sync.js` — the engine: per-workspace sync-meta (rev/mtime/dirty, local-only, not synced/backed up),
  `syncNow()` (pull→reconcile→push), debounced push on local writes, and background triggers
  (login/session, workspace switch, `online`, tab-visible, 60 s poll). Applies remote writes behind an
  `applyingRemote` guard so adopting server data doesn't loop back as a local change; fires the workspace
  event so live hooks re-read. Refreshes the access token once on a 401 and retries. Only the signed-in
  `shop:*` workspace syncs — never guest. Transport pluggable for tests.
- `main.jsx` — `startSync()` after first paint (no-op unless `ACCOUNTS_ENABLED` and a shop is signed in;
  never delays paint).
- `components/account/SyncStatus.jsx` — compact indicator in More → Settings (Synced · time / Syncing /
  Offline — saved on this device / Sync paused — will retry; tap to sync now). AccountView copy updated
  from "coming soon" to "pick up where you left off on another device".

## Conflict/edge behaviour (documented, accepted for v1)
- Single owner on 1–2 devices → real concurrent edits are rare; LWW-by-mtime is predictable.
- Migrating guest data into a shop that ALREADY has cloud data: bootstrap makes the server win, so those
  stores aren't merged — but the guest data still exists in the local guest workspace (copy, not move), so
  nothing is lost. Migration into a non-empty shop is already an edge the UI warns about.

## Verification
- Backend: app boots; `test:unit` 50/50; new `pwaSync.integration.test.js` (9 tests, DB-gated) SKIPS
  cleanly without `VENDORA_TEST_URI`. **CONFIRMED 9/9 against the live `vendora_test` Atlas cluster on the
  founder's PC (2026-10-01)** — `npm run test:pwa-sync`. (Gotcha that run surfaced: Atlas IP allow-list
  must include the founder's current IP; home IPs rotate, so re-add "Current IP" in Atlas → Network Access
  if a future run fails with `MongooseServerSelectionError`.)
- Frontend: full suite **121/121** (+7 new `sync.test.js`: bootstrap server-wins, upload-new, push edit,
  pull newer, conflict adopt-server, plus session/guest guards). Build clean.

## Follow-ups
- ~~Run the DB-gated sync suite on the founder's PC.~~ ✅ Done 2026-10-01 — 9/9 against `vendora_test`.
- Optional later: surface a one-time "updated from another device" toast; per-store conflict UI if a
  pilot shop actually runs two active devices; delete-propagation (currently a cleared store pushes an
  empty value rather than a tombstone — fine for the current stores).

## Commit
`feat(pwa): cross-device sync — per-store push/pull with LWW + safe first-login bootstrap (infra Stage 3)`
