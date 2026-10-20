# 2026-10-20 — Security/capacity review: fix the five reproduced defects (+ CORS ETag)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** sync (`sync.js`), account/session (`account.js`, `session.js`), auth (`rateLimit.js`,
`pwaAuthService.js`, `pwaAuthRoutes.js`), CORS (`app.js`) · [[Backend-Overview]] · [[Frontend-Overview]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

External security/data-integrity/capacity audit (pinned `6c0c013`) reproduced five defects; all fixed here.
The audit found **no cross-shop disclosure or auth bypass** and the verified controls held. The capacity
program (profiling, pagination, soak, staging campaign) is a separate workstream — not attempted here.

## T1 (P1) — sync could discard a newer local edit
`sync.js` push-conflict handler stashed/adopted against the **sent** snapshot, so an edit made WHILE the push
was in flight (send 10 → edit to 9 → server conflict 12) was lost (stashed 10, adopted 12, marked clean; 9
gone). Fix: reconcile against the **current** local value, never `sent`. Merge stores → per-item merge of
current-local + server (9 survives / loser recoverable); non-merge stores → LWW on the current local's mtime
(newer local kept + re-pushed; else current local stashed before overwrite). Regression test: newer in-flight
edit survives.

## T2 (P2) — oversized store rejected but shown as synced
Client cleared the dirty marker for ALL `rejected` reasons, so a `too_large` rejection read as "synced". Fix:
only clear dirty for `forbidden`/`unknown` (a write that will always be refused); `too_large` stays **dirty**
(pending) and the sync state surfaces an actionable error ("too large to back up — reduce it"), never a false
green. `SyncStatus` now shows `s.error`. Tests: too_large stays pending + preserved; forbidden clears.

## C1 (P2) — stale sign-out could purge the newly-selected account
`session.signOut` awaited a final sync then called `logout()`, which read the CURRENT session — if account B
signed in during the wait, B's workspace was purged. Fix: `signOut` pins the origin shopId before the wait;
`logout({ expectShopId })` refuses (no clear, no purge) when the live session no longer matches. Tests: B
untouched when identity changed; normal sign-out still purges the intended workspace.

## M1 (P2) — invalid registrations could lock out a victim's login
`/register` and `/login` shared the per-email limiter, so 10 invalid registrations with a victim email
returned 429 to the victim's login from another network. Fix: `/register` gets its OWN per-IP + per-email
limiters (separate instances → separate buckets / Redis prefixes). Login budgets are untouched by register
abuse. Test: register limiter is a distinct instance from login's.

## M2 (P2) — unbounded failed-login state + arbitrarily long emails
The lockout Map had no expiry/size bound and login accepted 128 KiB emails (→ 128 KiB keys). Fix: reject
emails > 254 chars (RFC 5321) **before** any key/hash work; limiter keys truncate email to 254; the lockout
Map now carries `at`, has a timer + opportunistic **sweep** of expired entries and a **hard size cap** with
oldest-eviction. Tests (DB-free, models mocked): lock after 10 for one email+IP, a different IP unaffected,
over-length email → 422 with no key stored, sweep drops expired, map stays ≤ cap under a unique-key flood.

## Also fixed — CORS defeated the ETag/304 fast-path (live observation)
The API's CORS allowed only `Content-Type,Authorization` and exposed no `ETag`, so the cross-origin
(Vercel→Render) frontend could neither read the sync ETag nor send `If-None-Match` — the delta-pull 304
never engaged in production. Added `exposedHeaders: ['ETag']` + `If-None-Match` to `allowedHeaders`.

## Verification
- Frontend: `npm run build` ✓, full **vitest 583 / 82**. SW v64 → **v65**.
- Backend: boots clean; `npm audit --omit=dev --audit-level=high` → **exit 0**; auth/sync/scale unit suites
  (loginLockout, scaleHardening, pwaStoreAccess, requestMetrics, centroidsMongo) green. DB-gated pwa-auth/sync
  integration runs in CI with Mongo.
- ⚠️ Live re-checks worth doing after deploy: a real two-tab sign-out race (C1), an oversized-store push shows
  "too large" not synced (T2), and a browser `If-None-Match` round-trip returns 304 with ETag visible (CORS).

## Commit(s)
- `0329e02` — fix(security,sync) five review defects + CORS ETag; docs.

## Follow-ups (capacity program — NOT done here, from the review's "required improvements")
- [ ] Profile/reduce transfer work; consider record/paginated transfers as store sizes grow.
- [ ] History listing loads full snapshot values to compute size — use a stored/precomputed size + projection.
- [ ] Confirm deployed Mongo indexes/pagination for doc listing; bound file-buffer memory.
- [ ] Shared rate-limit + lockout state before running >1 instance (already documented in [[Deployment]]).
- [ ] Representative staging campaign (warm/cold, bursts, soak, slow networks, agreed latency/error targets).
