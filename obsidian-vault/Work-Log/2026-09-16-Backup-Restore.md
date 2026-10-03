# 2026-09-16 — Export / restore backup

Back to [[Work-Log]] · Related: [[2026-09-16-Takings-And-Owner-Glance]] · [[ADR-001-Shared-Backend]] · [[Connect-Backend-MongoDB]]

## Goal
Local-first data lives only in the device's localStorage — so give shops a **backup they can save and restore** (new phone, cleared browser) as peace of mind before the backend exists.

## What changed (files)
- 🆕 `frontend/src/lib/backup.js` — `buildBackup()` bundles all `vendora_*` localStorage keys into one JSON (`{app:'vendora',version,exportedAt,data}`); `downloadBackup()` (blob download), `shareBackup()` (Web Share files where supported — nice on iOS), `restoreFromText()` (validates `app:'vendora'`, writes keys back).
- ✏️ `frontend/src/pages/HomePage.jsx` — **Backup** section in the More tab: **Export backup** (share → download fallback) and **Restore from backup** (hidden file input → read → restore → reload). Toasts on success/failure.

## Verification (headless Chromium @ 390×844)
- `npm run build` ✓.
- Seeded shop type + inventory + takings → **Export** downloaded a valid `vendora` backup (3 keys) → wiped inventory (null) → **Restore** from the file → inventory back (Coca-Cola present). No page errors. (Export used download; on a phone `shareBackup` opens the share sheet.)

## Why (strategy)
Removes the biggest risk of local-first ("what if I lose it?"). Also a clean bridge to [[ADR-001-Shared-Backend]] — the same bundle shape is what we'll push to the backend when Mongo is connected.

## Commit
- feat(app): export / restore local data backup
