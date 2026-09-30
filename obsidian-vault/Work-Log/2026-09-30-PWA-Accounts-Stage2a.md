# 2026-09-30 — Infra Stage 2a: PWA owner accounts (client core) + guest→shop migration

Back to [[Work-Log]] · Related: [[2026-09-30-IndexedDB-Durability]] · [[ADR-002-App-Till-Separation]]

## Goal
Begin Phase 2 Stage 2: give the PWA its own shop-**owner** account (email/password), so data is tied
to the owner (not one phone) and can later sync across devices. Separate from the till's Staff/PIN auth
(ADR-002). Done in verifiable slices because backend auth needs MongoDB, which this sandbox can't run.

## Decision: a separate, lightweight PWA owner account
The backend already has a full **till** auth system (Store + Staff, PIN/password, 2FA, JWT
access/refresh). That authenticates *staff into a Store*. The PWA needs to authenticate *an owner into
a workspace* — a different concept. Per ADR-002 we keep them separate: a new `/api/pwa-auth/*` surface
and its own account record, **reusing the already-hardened JWT signing + secret-validation infra**
(`config/validateSecrets.js`) rather than the Staff/PIN flow.

## Shipped this slice (Stage 2a — client, fully verified) — `lib/account.js`
- Device-level session (`vendora:auth`) stored OUTSIDE the workspace-scoped stores, so a backup never
  carries credentials (backup.js already skips token/account keys).
- `register` / `login` / `refresh` / `logout` against a **pluggable transport** (real `fetch` by
  default, injectable mock for tests) — so the logic is testable with no server.
- On auth success, the active workspace switches to `shopWorkspace(shop.id)`.
- **Explicit guest→shop migration**: `guestDataExists`, `shopHasData`, `migrateGuestIntoShop` (wraps
  the existing non-destructive `copyWorkspace`). Guest data is only moved into the shop when the owner
  chooses — never silently, never overwriting the shop's own data.
- `useSession` hook for the UI.

## Backend contract for Stage 2b (to build next; needs deploy + Mongo to verify)
`POST /api/pwa-auth/register { email, password, shopName }` → `{ token, refreshToken, shop:{id,name} }`
`POST /api/pwa-auth/login { email, password }` → same
`POST /api/pwa-auth/refresh { refreshToken }` → `{ token }`
`GET  /api/pwa-auth/me` (Bearer) → `{ shop }`
- New `Account` model (email unique, bcrypt password, shopId, shopName); reuse `config.jwt` +
  `validateSecrets`; rate-limit login; never leak whether an email exists.

## Verification (actual)
- Vitest: **6 new** (register/login persist + workspace switch; refresh updates only access token;
  failed login leaves no session; logout returns to guest without deleting data; guest→shop migration
  copies into an empty shop; never overwrites the shop's existing data). Full FE suite **105/105**.
  Build clean.
- Backend endpoints **not built yet** (Stage 2b): they can only be verified with MongoDB, which this
  sandbox lacks, and going live needs a deploy — both require the owner's explicit go-ahead.

## Data preserved
Additive. Session is a new device-level key; migration is explicit + non-destructive. No existing data touched.

## Commit
`feat(app): PWA owner-account session + guest→shop migration (infra Stage 2a, client)`
