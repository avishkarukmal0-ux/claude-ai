# 2026-09-30 — PWA accounts LIVE in production (verified by founder)

Back to [[Work-Log]] · Related: [[2026-09-30-Accounts-Deploy-Prep]] · [[2026-09-30-PWA-Accounts-Stage2b]]

## Milestone
Founder deployed the backend and turned accounts on; register → login → stay-signed-in-through-refresh
**confirmed working on the live site** (`https://claude-ai-indol.vercel.app/account`). "100% successful."
Phase 2 Stage 2 (PWA owner accounts) is complete and verified in production.

## Live stack (founder-provisioned)
- Backend: Render free tier — `https://vendora-api-5pyt.onrender.com` (commit d739b1a → later 4e02424),
  `/health` = db connected, env production. Mongo = Atlas db `vendora_pilot`. No Redis (runs without).
- Frontend: Vercel project `claude-ai`, prod branch `claude/vendora-pos-v3-KPnI0`,
  `VITE_API_BASE`=Render URL, `VITE_ACCOUNTS_ENABLED`=true, `VITE_API_URL`=Render `/api`.

## Fixes shipped to get here (this session)
- `feat: env-driven accounts flag + Render deploy prep` (VITE_ACCOUNTS_ENABLED / VITE_API_BASE; Redis
  optional) + `DEPLOY-ACCOUNTS.md`.
- `fix(pwa): auto-update service worker` — bumped `sw.js` CACHE_VERSION v1→v2 and added a
  controllerchange reload, because shops were stuck on a stale cached build (no `/account`, fell back to
  the till `/login` "_id not found").
- `fix(app): forward /login to /account when accounts enabled` — the till Staff/PIN login (empty DB →
  "_id not found") no longer traps users; it redirects to the PWA owner login.

## Notes / decisions
- Landing-page email button re-enabled with `avishkarukmal0@gmail.com` (founder wrote "hmail.com" —
  read as gmail typo; temporary, change anytime).
- Till seeding intentionally NOT done — PWA doesn't need it, and `npm run seed` DROPS the database.

## Open housekeeping (founder)
- Tighten Atlas Network Access (remove `0.0.0.0/0` on the throwaway cluster) before real data.
- For real paying shops later: dedicated prod Atlas cluster (not `vendora_pilot`/`vendora_test`), paid
  Render tier to kill ~50s cold start, custom domain.

## What's left overall
Not code — the **pilot**: get shop owners to try it and pay. Stage 3 (sync) / Stage 4 (push) / invoice
OCR remain deferred until demand proves them out.
