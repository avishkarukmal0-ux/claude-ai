# 2026-10-16 — Scale readiness: sync throughput, rate-limit keying, load test

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Backend-Overview]] · [[API-Routes]] · sync (`pwaSyncService`, `sync.js`), rate limiting, infra
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Make the PWA sync path survive ~100 shops × 3–7 staff (≈500–700 devices). Audit flagged 8 items; two were
already in place, the rest cut per-poll bandwidth and request volume and fix the shared-IP rate-limit cliff.

## Already done before this session (confirmed, no change)
- **Member-status cache (#5):** `pwaAuthService.assertMemberActive` already caches `Member.findById` for 30s
  per member with the `tokenVersion` check and `invalidateMember` on admin writes.
- **Indexes (#7):** `SyncBlob {account,name}` unique and `SyncBlobHistory {account,name,rev}` + TTL already
  exist in the models.

## Changes
- **#1 Delta pull + ETag/304** (`pwaSyncService.pull`, `pwaSyncRoutes` GET `/pull`, client `sync.js`):
  - Client now sends `?revs=name:rev,…` (built from its sync-meta) and `If-None-Match: <last ETag>`.
  - Server returns ONLY stores newer than the client's known rev; a weak ETag over the role-visible
    `(name:rev)` set means a matching `If-None-Match` → **304, empty body**. No `revs` → all stores (safe
    bootstrap / legacy client unchanged). Client stores the ETag in `__syncmeta.__etag`, handles 304 by
    skipping the adopt phase (push still runs).
  - Transport (`fetchTransport`) gained `query` + `ifNoneMatch`, 304 handling, and ETag capture.
- **#2 Poll cadence + push batching** (`sync.js`): fixed 60s `setInterval` → a self-rescheduling timer —
  **5min idle, 60s while actively editing (an edit in the last 2min), paused entirely while the tab is
  hidden** (resumes + catches up on return). Push debounce 2s → **5s**, still coalescing all dirty stores
  into one request.
- **#4 Rate-limit keying** (`middleware/rateLimit.js`, `app.js`): limiters now key by **shop/account id**
  when a valid PWA token is present (a shop's many phones no longer share one IP bucket), falling back to IP
  for unauthenticated routes. A forged token can't borrow a shop's bucket (token is fully verified; invalid →
  IP). New **`syncLimiter` = 300/min per shop** mounted on `/api/pwa-sync` (generalLimiter now skips that
  path). **`authLimiter` keyed by email+IP** (not IP alone). IPv6 grouped to /64.
- **#6 History dedupe** (`recordHistory`): skip a snapshot when the newest kept revision already holds the
  identical value (no-op re-push with a bumped mtime), so `SyncBlobHistory` stops growing with duplicates.
  `restore` still always records (audit trail). History is still off unless `SYNC_HISTORY=true`.
- **#7 Compression** (`app.js`): added `compression()` middleware (dep `compression@1.7.5`). Belt-and-braces
  over Render's Cloudflare edge; big pull JSON shrinks ~5–10× on the wire.
- **Load test (`backend/scripts/loadtest/sync-load.js` + README):** k6, 700 virtual devices (140 shops × 5),
  realistic delta-pull/push cycle, per-shop token. Thresholds: p95<500ms, `http_req_failed`<1%, **0 × 429**,
  checks>99%. Hard-refuses the production host; staging only.
- **#8 Infra notes** → [[Deployment]] (owner actions: paid Render in Frankfurt to co-locate with Atlas
  EU_WEST_1, paid Atlas tier same region, `/healthz` health check).

## Deferred — needs its own pass + a decision
- **#3 Per-item merge** (union by id, per-item newest-mtime, tombstones for deletes; stock qty via movement
  deltas, not absolute values). This changes delete semantics across inventory/orders/deliveries/claims/
  credit-notes and risks data loss if rushed. Whole-store last-write-wins (with the conflict-backup safety
  net) stays for now. Design options captured for the owner: **(a)** client-side 3-way merge at pull time
  (keeps the server opaque; needs per-item `updatedAt` + soft-delete tombstones in the stores), vs **(b)**
  server parses id-keyed stores and merges (breaks the opaque-blob design, needs migration). Recommend (a).

## Decisions
- Kept the server **opaque-blob** model for delta pull (rev-based filtering only; no JSON parsing) — minimal
  blast radius, no migration.
- Verify the **shop token** in the rate-limit keyGenerator (not just decode) so keying can't be spoofed.
- `syncLimiter` before `generalLimiter` + `skip` on the sync path so the two never double-count.

## Verification
- Backend `node -e "require('./src/app.js')"` loads clean. New unit tests **`scaleHardening.test.js` (8)** +
  existing unit suites (`pwaStoreAccess`, `pwaNotify`) green (28 total). Integration suites
  (`pwaSync.integration`, …) are DB-gated (`VENDORA_TEST_URI`) — unchanged contract (no-`revs` pull still
  returns all blobs; `{success,blobs}` shape preserved).
- Frontend `npm run build` ✓, full **vitest 549 / 80** (client `sync.test.js` 12 green — fake transport
  ignores the new query/If-None-Match and returns all blobs, so bootstrap/LWW paths are unchanged).
- SW v61 → **v62**.
- ⚠️ Live load test must be run against **staging** by the owner (k6 not runnable from this sandbox; proxy
  blocks the host).

## Commit(s)
- `e498c09` — feat(sync): delta pull + ETag, per-shop rate limits, compression, history dedupe, load test (code: backend + client sync.js + SW)
- `<hash-docs>` — docs

## Follow-ups
- [ ] Owner: run `sync-load.js` against staging; confirm p95<500ms / 0 × 429 at 700 devices.
- [x] Decide + implement **#3 per-item merge** — done 2026-10-18 (client-side), see [[2026-10-18-per-item-merge-sync]].
- [ ] Owner infra: paid Render (Frankfurt) + paid Atlas (eu-west-1) co-located; `/healthz` health check.
