# 2026-09-30 — Accounts deploy prep (env-driven flag + Render checklist)

Back to [[Work-Log]] · Related: [[2026-09-30-PWA-Accounts-Stage2b]] · deploy steps: `vendora-pos/DEPLOY-ACCOUNTS.md`

## Goal
Founder decided to turn accounts ON. Make it deployable + toggleable without code edits, and hand over a
plain deploy checklist. Invoice/OCR explicitly deferred.

## Changes
- `frontend/src/lib/account.js`: `ACCOUNTS_ENABLED` now reads `VITE_ACCOUNTS_ENABLED==='true'` (was a
  hardcoded `false`); API base already read `VITE_API_BASE`. So accounts turn on via **Vercel env vars +
  redeploy**, no code change — and stay off by default (both unset → hidden login).
- `backend/src/config/redis.js`: run without Redis in ANY env when `REDIS_URL` is unset (was prod-only
  path that tried localhost:6379 and spammed errors). Lets a Render free-tier deploy run clean; add
  `REDIS_URL` later to re-enable caching/token-blacklist.
- Backend was already cloud-ready: reads `PORT`, CORS allows `*.vercel.app` + `CORS_ORIGIN`/`FRONTEND_URL`,
  `/health` + `/api/health` report DB status, Mongo via `MONGODB_URI`, prod secret fail-fast intact.
- `vendora-pos/DEPLOY-ACCOUNTS.md`: click-by-click — Render web service (root `vendora-pos/backend`,
  start `node server.js`, env NODE_ENV/MONGODB_URI/JWT_SECRET/JWT_REFRESH_SECRET), Atlas 0.0.0.0/0,
  `/health` check; then Vercel env (`VITE_API_BASE`, `VITE_ACCOUNTS_ENABLED=true`) + redeploy; verify.

## Verification
- FE: account + account-view tests 9/9; build clean.
- BE: app boots; pwa-auth suite skips cleanly without a URI (unchanged).
- Not deployed by this session (guardrail): the founder runs the checklist. The live frontend still hides
  login until `VITE_ACCOUNTS_ENABLED=true` is set in Vercel.

## Deferred (founder's call)
Reviewed invoice extraction / OCR — later.

## Commit
`feat: env-driven accounts flag + Render deploy prep (no deploy)`
