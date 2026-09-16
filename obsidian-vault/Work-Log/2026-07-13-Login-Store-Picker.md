# 2026-07-13 — Login store picker (no more pasting a Mongo ID)

Back to [[Work-Log]] · [[Home]] · [[API-Routes]] · [[Frontend-Overview]]

**Domain(s):** auth / login
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Problem
Login required a `storeId` — a Mongo ObjectId generated fresh on every seed. Users had to paste it in. Terrible UX and a blocker when the ID isn't remembered.

## Changes
- **NEW** `GET /api/auth/stores` (public, in `authRoutes.js`) — returns active stores (`_id` + `name` only) for the login picker.
- `frontend/src/services/auth.js` — added `getStores()`.
- `frontend/src/pages/LoginPage.jsx` — Store ID text field → **dropdown** populated from `/auth/stores`; auto-selects if only one store; "Enter Store ID manually" fallback if the list is empty/unavailable.

## Seeded demo logins (from `utils/seedData.js`)
Store: **Raj's Off-Licence**. Owner `EMP001` / PIN `1111` / pw `owner123`; Manager `EMP002`/`2222`/`manager123`; Supervisor `EMP003`/`3333`; Cashier `EMP004`/`4444`.

## Security note
Listing store names+ids unauthenticated is a minor info disclosure — fine for single-store/self-host/demo. For a large multi-tenant SaaS, gate `/auth/stores` behind an env flag. Logged as a follow-up.

## Verification
- `require('./src/routes/authRoutes.js')` ✅ · frontend `npm run build` ✅

## Commit(s)
- _(pending)_ — `feat: store picker on login (GET /auth/stores) instead of pasting a store id`

## Follow-ups
- [ ] Optional env flag to hide the store list in multi-tenant production
