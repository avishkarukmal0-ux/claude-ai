# 2026-10-18 — Scale-audit follow-ups (6): auth limiters, merge/clock correctness, pull cost, UX

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Backend-Overview]] (rate limiting, auth, pull), sync (`mergeStore`, `syncClock`, `sync.js`,
the 5 stores), [[Frontend-Overview]] (SyncStatus), load test
**Branch:** `claude/vendora-pos-v3-KPnI0`

Six follow-ups from the scale audit, after [[2026-10-18-per-item-merge-sync]].

## 1 — Credential-route limiters + login lockout (SECURITY) · `c914b4b`
The `email|ip` auth limiter let one IP try UNLIMITED different emails (credential stuffing / mass register).
`/api/pwa-auth` login+register now **stack two limiters**: per-IP across all emails (**60/min**) and per-email
across all IPs (**10/min**) — neither axis is open. Added a conservative in-memory **login lockout** (10 fails
→ 15-min lock, cleared on success; documented griefing trade-off, hence high threshold + short lock). Till
`/api/auth` keeps its existing `authLimiter` + Redis PIN lockout (deferred, off by default).

## 2 — mergeInventory prune-skew bug · `a187bde`
`qty = opening(winner) + ledgerSum(merged)` was wrong when the two devices' ledgers differed only by pruning
(movementStore prunes at 180d / 5000 rows): a row pruned on one device but live on the other was counted again
on top of a stored qty that already baked it in (repro: → 6, expected 10). Fix: a consistent **age cutoff**
(`MERGE_LEDGER_WINDOW_DAYS = 180`, matching the prune window) applied to BOTH the opening baseline and the
merged sum (`ledgerSumSince`). Rows older than the cutoff are excluded on both sides. +2 repro tests (server-
and local-holds-old-row).

## 3 — Device-clock skew · `1d65e4d`
A fast phone always won per-item merges and its tombstones deleted genuinely newer edits (merge `updatedAt` and
tombstone `at` are device-stamped). Fix: **`lib/syncClock.js`** learns the server wall-clock from the `Date`
response header; the 5 id-keyed stores stamp `updatedAt` with the corrected `now()`, tombstones stamp `at` with
it. Server also **clamps an incoming blob mtime to `min(mtime, serverNow)`** so a fast client can't win
whole-store LWW forever either. +4 unit tests.

## 4 — Pull no longer reads every value on an idle poll · `c914b4b`
`pwaSyncService.pull` now queries `{name, rev, mtime}` first (the ETag is a function of name:rev only), returns
304/empty when nothing changed, and fetches the (potentially ~MB) `value`s ONLY for stores newer than the
client's revs. Big saving at 500 devices polling.

## 5 — Sync-status UX · `1d65e4d`
Poll at the fast **60s cadence for the first 10 min after opening** (not just while editing) before dropping to
the 5-min idle cadence. `SyncStatus` shows **"Updated N min ago"** and re-renders every 30s so the label counts
up between syncs.

## 6 — Load-test guards · `c914b4b`
`sync-load.js` refuses to run without **`-e STAGING=1`** and rejects a `BASE_URL` on the production-host
denylist (with a commented slot for the custom production domain before go-live).

## Decisions
- Login lockout kept in-memory + conservative (per-instance; nuisance-only griefing window) rather than a hard
  escalating ban — the limiters are the primary control.
- Clock correction via the `Date` header (≈1s resolution) is plenty for a minutes-scale skew problem and needs
  no API change; before the first sync the offset is 0 (`now() === Date.now()`).

## Verification
- Frontend: full **vitest 578 / 82** (+2 prune, +4 clock); `npm run build` ✓. SW v63 → **v64**.
- Backend: boots clean; `scaleHardening.test.js` 9 + unit suites green. Integration suites (DB-gated) unchanged
  in contract (clamp only pulls future mtimes down; test mtimes are tiny/past; pull shape preserved).
- ⚠️ Still no live two-device / load run from the sandbox — logic verified via unit + fake-server tests.

## Commit(s)
- `c914b4b` (#1,#4,#6), `a187bde` (#2), `1d65e4d` (#3,#5) + this docs commit.

## Follow-ups
- [ ] Add the custom production domain to `PROD_DENY` in `sync-load.js` before go-live.
- [ ] Real two-device smoke test (still outstanding from the per-item-merge work).
