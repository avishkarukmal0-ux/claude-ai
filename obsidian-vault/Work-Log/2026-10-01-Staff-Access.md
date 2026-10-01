# 2026-10-01 — Invoice mandate #5: individual staff access (backend-enforced roles)

Back to [[Work-Log]] · Builds on [[2026-09-30-Cross-Device-Sync]] · routes in [[Backend/API-Routes]]

The first of the two deferred, security-sensitive mandate items. Gives a shop its own team logins with
**server-enforced** permissions — not just UI hiding.

## The model (honest for a local-first PWA)
Shop data lives on-device and syncs to the backend as **opaque per-store JSON blobs** keyed by account.
So "backend-enforced roles" can't mean per-record authz the server can't see — it means:
- **Members are real server records.** New `models/Member.js` (`PwaMember`): `{ account→PwaAccount, email
  (unique), passwordHash, name, role: manager|staff, active }`.
- **One shop, one workspace.** A member's token carries the OWNER account id as `shopId`, so everyone works
  in the same workspace and sync isolation (scope-by-shopId) is unchanged. The token also carries `role`,
  `mid` (member id) and `name`.
- **The guard is on the sync routes.** `pwaSyncService` now gates by role: a `staff` role may not write
  **or read** the financial stores (`takings_v1`, `claims_v1`, `credit_notes_v1`, `invoices_v1`). `push`
  returns forbidden stores in a new `rejected[]` (applies the rest); `pull` omits them. owner/manager (and
  legacy tokens) keep full access. A tampered client can't bypass this.

## Backend
- `pwaAuthService`: `login` resolves owner → else active member (generic 401, no enumeration). Tokens via
  `tokensFor({shopId,role,memberId,name})`. `refresh` re-validates a member against the DB (deactivation
  cuts access; a role change takes effect next refresh); owner refresh stays DB-free. `me(decoded)` returns
  shop+role+member. New owner-only CRUD: `listMembers/addMember/updateMember/removeMember` + `requireOwner`.
- `pwaAuthRoutes`: `GET/POST /staff`, `PATCH/DELETE /staff/:id` behind an `ownerGate`.
- `pwaSyncService`: `canWriteStore`/`canReadStore`/`FINANCIAL_STORES`; `push(…, role)` → `{applied,
  conflicts, rejected}`; `pull(…, role)` filters. Routes pass `req.pwa.role`.

## Frontend
- `account.js`: session carries `role`+`member`; `currentRole()`/`currentMember()`; `useSession` exposes
  them; `refresh` adopts the server's returned role.
- `lib/permissions.js` (pure, tested): client mirror — `canWriteStore`, `canSeeScreen`, `can`, `MONEY_SCREENS`.
- `lib/actor.js` (pure, tested): `currentActor`/`actorName`/`stamp` — best-effort attribution from the
  signed-in member (guest → "Owner"). Wired into delivery receive (`receivedBy`), stocktake save (`by`) and
  claim creation (`raisedBy`) — fields the weekly report already reads.
- `lib/staffAdmin.js` (client, tested transport) + `components/account/StaffView.jsx` (owner-only: add /
  role / reset password / deactivate / remove). Degrades honestly if the backend isn't deployed.
- `sync.js`: consumes `rejected[]` — clears dirty so it stops re-pushing a store the role can't write.
- `HomePage`: role-aware — staff don't see money tiles/the Money group/price screens; owner sees a **Staff
  access** row; every money + staff-admin screen is guarded on render (defence in depth).

## Verification
- FE **188/188** (+16: permissions 8, actor 3, staffAdmin 5). Build clean.
- BE: app loads; `pwaStoreAccess.test.js` (pure, 6) green offline. DB-gated integration extended
  (`pwaAuth.integration` staff CRUD/role/deactivation/refresh; `pwaSync.integration` role push/pull) — runs
  on the founder's Mongo via `VENDORA_TEST_URI`.

## Caveats (stated, not hidden)
- Attribution is best-effort (records are client-authored), not forensic.
- Read-protection via pull-filtering can't erase blobs already on a shared device; it stops a fresh staff
  device from downloading financial records. Writes are the hard guard.

## Setup / deploy
Render backend redeploy needed for `/api/pwa-auth/staff` + role-aware sync. No new env vars.

## Commit
`feat(pwa): individual staff access with backend-enforced roles (#5)`

## Follow-up
[[2026-10-01-Notifications]] — mandate #6 (daily digest, email + device).
