# 2026-09-30 — Disable the deferred till for the PWA-only pilot (audit response, pass 0)

Back to [[Work-Log]] · Related: [[2026-09-30-Accounts-Live]] · [[ADR-002-App-Till-Separation]] · audit: `uploads/6cbe3ee6-Vendora-Audit-2026-09-30.md`

## Why
A third-party audit (commit 1dee9fb) flagged ~30 high-risk findings in the **deferred till** (sales,
refunds, self-checkout, gift cards, loyalty, stocktake, staff roles, payroll, Stripe, sockets). The till
isn't part of the live pilot, so the safest first move is to make it **unreachable** — then none of those
findings are exploitable in the pilot — rather than fixing the till now.

## Change: TILL_ENABLED flag, OFF by default (both sides)
- `backend/src/config/index.js` — `till.enabled = process.env.TILL_ENABLED === 'true'` (default false).
- `backend/src/routes/index.js` — only `/api/pwa-auth` (+ `/health` from app.js) is mounted by default.
  ALL till routes (`/auth`, `/sales`, `/self-checkout`, `/staff`, `/customers`, `/purchase-orders`,
  `/stock-take`, `/subscriptions`, …) are mounted only when `TILL_ENABLED=true`. Off → they 404, so
  audit S1/S3/S4/S5/S6/S7/S8 and T1–T15 are not reachable.
- `backend/server.js` — `io.use()` rejects ALL socket connections when the till is off (closes S2:
  anonymous shop-room join). Real JWT handshake auth is the till work-package for when it's re-enabled.
- `frontend/src/App.jsx` — `VITE_TILL_ENABLED` (default false) gates the entire `<TillProviders>` route
  block; `/pos`, `/self-checkout`, `/staff`, etc. fall through to the existing catch-all → `/`. So the
  till frontend pages (self-checkout contract, tap-to-pay, offline queue) can't be opened.
- `backend/src/__tests__/setup.js` — sets `TILL_ENABLED=true` before app/config load so the till's own
  DB-backed integration suites still run (they test the till). The self-contained pwaAuth suite keeps the
  till gated (only needs `/api/pwa-auth`).

## Effect
- Live pilot backend (Render) exposes only `/health` + `/api/pwa-auth/*`. Live frontend exposes only the
  PWA (`/`, `/home`, `/account`; `/login`→`/account`). The till is dark.
- To turn the till back on later (after its findings are fixed + verified): set `TILL_ENABLED=true`
  (Render) and `VITE_TILL_ENABLED=true` (Vercel). Fully reversible, no code change.

## Verification
- Backend boots with till off; **50/50** DB-free unit tests; pwa-auth suite skips cleanly w/o URI.
- Frontend **108/108**; build clean.
- Not deployed by this session — founder deploys (Render auto-builds on push; till stays off since the env
  var isn't set).

## Still open for the PWA pilot itself (audit "pass 1", next)
F1 logout-not-clearing-IDB (verified regression), F6/D4 honest copy, F2–F5 storage robustness, D2 headers,
F10 SW reload, F11 a11y. These are the small, real, PWA-relevant items to fix next.

## Commit
`fix(security): gate the deferred till behind TILL_ENABLED (off by default) — audit response`
