# 2026-10-18 — Re-audit: lockout keying + per-process store scale-out note

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Backend-Overview]] — auth lockout, rate-limit store; [[Deployment]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

Two re-audit findings on the scale-audit follow-ups ([[2026-10-18-scale-audit-followups]]).

## 1 — Login lockout was email-only → remote griefing
The in-memory login lockout keyed by **email alone**, so anyone who knew an owner's email could lock them out
for 15 min **from anywhere** (incl. locking the real owner out at their own shop). Fixed: key the failure
counter by **`email|ip`** (`ipKey(req)` passed from the route into `pwaAuthService.login(body, { ip })`). A
remote attacker now only locks their OWN source; distributed guessing across IPs is still bounded by the
per-email **rate limiter** (10/min), which stays the control for that axis. `assertNotLockedOut` /
`noteLoginFailure` / `noteLoginSuccess` now take the composite key.

## 2 — Per-process limiter + lockout state won't survive scaling out
express-rate-limit's MemoryStore and the lockout `Map` are per process, so >1 Render instance would multiply
the effective caps and split the lockout. Correct on the current single instance; must become shared before
scaling. Done:
- **Rate limiters are wired for Redis**: `makeStore(prefix)` in `rateLimit.js` returns a `rate-limit-redis`
  store (own key prefix per limiter) **iff** that package is installed AND `REDIS_URL` is set; otherwise it
  returns undefined → MemoryStore. Inert today (package not installed, no `REDIS_URL`) → no behaviour change;
  the ioredis client (already a dep) is only created when both conditions hold.
- **Documented the scale-out requirement** in [[Deployment]] ("Scaling out requires shared rate-limit +
  lockout state"): install `rate-limit-redis` + set `REDIS_URL`; move the lockout map to Redis/Mongo (keyed by
  `email|ip`, TTL = lockout window) — it's isolated behind the three helpers; keep `trust proxy` correct; pin
  to one instance until done. Code comments at both sites point to the note.

## Decisions
- Didn't add `rate-limit-redis` to package.json (keeps the dep out until actually scaling); the require is
  guarded so it's a pure install-and-set-env step later. Flagged that the Redis path needs a load test when
  first enabled (not exercised single-instance).
- Left the lockout map in-memory (correct for one instance) rather than build an untested Redis-backed lockout
  now; documented it as the required pre-scale change.

## Verification
- Backend boots clean (no Redis client created without `REDIS_URL` + package). `scaleHardening` 9 +
  `pwaStoreAccess`/`pwaNotify` → **29** unit tests green. Frontend untouched.
- Lockout full-flow is DB-gated (`pwaAuth.integration.test.js`), exercised in CI with Mongo.

## Commit(s)
- `939f444` — fix(security) + docs (this).

## Follow-ups
- [ ] When scaling >1 instance: install `rate-limit-redis` + `REDIS_URL`, move lockout to a shared store, load-test.
