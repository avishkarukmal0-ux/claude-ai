# 2026-09-30 — Infra Stage 2b: PWA owner-account backend (/api/pwa-auth)

Back to [[Work-Log]] · Related: [[2026-09-30-PWA-Accounts-Stage2a]] · [[ADR-002-App-Till-Separation]]

## Goal
The server side of PWA owner accounts, matching the Stage 2a client contract. Separate from the till's
Staff/PIN auth (ADR-002); reuses the hardened JWT config.

## Shipped (backend)
- `models/Account.js` — `PwaAccount` (email unique+lowercased, bcrypt passwordHash, shopName). shopId = _id.
- `services/pwaAuthService.js` — register / login / refresh / me / verifyAccess. Tokens carry `typ:'pwa'`
  (never confused with till Staff tokens). Login is a generic 401 whether or not the email exists (no
  account enumeration). Register rejects duplicate email (409) and weak input (400, password ≥ 8).
- `routes/pwaAuthRoutes.js` — POST /register, /login (authLimiter), /refresh, GET /me. Mounted PUBLIC at
  `/api/pwa-auth` in `routes/index.js` (before authenticate/storeContext).
- `middleware/rateLimit.js` — limits lifted under `NODE_ENV=test` so integration suites aren't throttled;
  real caps unchanged in dev/prod.
- Tests: `__tests__/pwaAuth.integration.test.js` — SELF-CONTAINED (does not require ./setup, so it never
  seeds Store/Staff or collides on a persistent Atlas DB). Connects to `VENDORA_TEST_URI`, uses only that
  DB (vendora_test), cleans up only its own `pwa-int-test…` accounts, and SKIPS entirely when the env var
  is unset. `npm run test:pwa-auth` targets just this file.
- `scripts/dns-8888.js` — preload (`NODE_OPTIONS=--require`) to force public DNS for `mongodb+srv` SRV
  lookups on networks that refuse them (the querySrv ECONNREFUSED the founder hit).

## Verification
- **Verified in this sandbox:** app boots with the routes wired (`node -e "require('./src/app.js')"`);
  DB-free unit suite **50/50**; the pwa-auth suite **skips cleanly (6 skipped)** with no URI.
- **NOW VERIFIED against a live DB (2026-09-30):** founder ran `npm run test:pwa-auth` on their Windows
  PC against the throwaway `vendora_test` Atlas cluster (with `VENDORA_DNS_PUBLIC=1` for the hotspot SRV
  DNS issue). **6/6 passing** — register (+tokens+shop), duplicate-email 409, login correct/wrong/unknown
  (generic 401), refresh + /me, validation 422 (short password/bad email), /me rejects bad token 401.
  One assertion was corrected during the run (validation is 422, not 400 — AppError.validation's contract).

## Guardrails held
- Accounts stay OFF for users: `ACCOUNTS_ENABLED = false` (Stage 2a) — the login entry is hidden until
  the founder says deploy. **Nothing deployed.** Real password never in chat, code, or commits.

## Commit
`feat(backend): PWA owner-account endpoints /api/pwa-auth + DB-gated tests (infra Stage 2b, unverified vs live DB)`
