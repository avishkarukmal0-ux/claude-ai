# 2026-10-02 — Review mandate Phase 3: protect document evidence (invoice files)

Back to [[Work-Log]] · [[Home]] · follows [[2026-10-02-Review-Phase2-Buying-Journey]] · config in [[Deployment-Config]]

**Domain(s):** Invoices (files), Backend PWA routes
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Finding (verified at HEAD)
Invoice **records** sync (`invoices_v1`), but the raw **files** live in `invoice_files_v1`, which is in
`LOCAL_ONLY_STORE_NAMES` — device-local, excluded from sync/backup. No PWA file endpoint existed. Finding real.

## Changes
**Backend (flag-gated, OFF by default):**
- `config/index.js` — `docBackup { enabled (DOC_BACKUP), provider (gridfs), maxBytes (DOC_MAX_FILE_MB×MB),
  allowedTypes }`.
- `services/pwaDocService.js` (new) — GridFS-backed store (`pwa_invoice_files` bucket). `upload` (validate
  type+size; replace-on-retry so no duplicates), `download`, `remove`, `list`. **Shop isolation**: every file
  tagged with the account id; every read/delete filters on it.
- `routes/pwaDocRoutes.js` (new, mounted `/api/pwa-docs`) — same auth gate as pwa-sync
  (`verifyAccess` + `assertMemberActive`), **owner/manager only** (invoices are financial). `GET /status`,
  `GET/POST/DELETE /invoice/:fileId`, `GET /invoice` (list). multer memory storage capped at `maxBytes`.

**Frontend (flag-gated `VITE_DOC_BACKUP`):**
- `lib/cloudDocs.js` (new) — authed client; device-local per-file state (pending/uploaded/failed) for
  progress + retry; `backupAvailable` (flag + signed-in + server `enabled`), `backupInvoiceFile`,
  `fetchBackedUpFile`, `deleteBackup`, `listBackedUp`, `retryFailed`. Pluggable transport for tests.
- `components/invoices/InvoiceCaptureView.jsx` — per-invoice **Back up / Backing up… / Backed up ✓ / Retry**
  control (only when available), a "stored on this device only" note, uses the server list as source of truth.

## How requirements are met
- Suitable file storage, not JSON sync blobs → GridFS bucket, dedicated endpoint.
- Shop isolation (upload/download/delete) → account-id metadata filter on every op; owner/manager only.
- Validate type + size → service + multer.
- pending/uploaded/failed states + safe retry/interrupted uploads → local state machine + idempotent replace.
- Retention/deletion controls → existing local "Delete file" + new server-side delete.
- Preserve local files + show backed-up state → local copy untouched; "Backed up" only after server confirms.
- Document provider/config + secrets server-side → [[Deployment-Config]]; GridFS needs only `MONGODB_URI`.
- **Do not claim recoverable until tested** → the round-trip/isolation/delete integration test is DB-gated
  and was NOT run here (no sandbox Mongo); documented explicitly, and the UI makes no cross-device promise.

## Verification
- Frontend: `clouddocs.test.js` (5) — state machine, failure/retry, delete clears, list set. Full suite
  **311/311**; build clean.
- Backend: `pwaDoc.integration.test.js` (6, DB-gated) — status, upload→list→**byte-identical download**,
  **isolation** (shop B 404s on shop A's file), bad-type reject, delete, auth-required. **Skipped here**
  (no Mongo); DB-free unit suite **56/56**; `require('./src/app.js')` loads clean.

## Commit(s)
- (this commit) — feat(pwa): invoice document backup to GridFS, shop-isolated, flag-gated (Phase 3)

## Follow-ups / limitations
- [ ] Run `pwaDoc.integration.test.js` with `VENDORA_TEST_URI` (or a manual cross-device restore) before
      telling owners documents are recoverable.
- Downloads load the whole file into memory (fine for ≤10MB invoice files); a streaming download could come
  later. No auto-backup on capture yet (explicit button) — deliberate, to keep uploads owner-controlled.
