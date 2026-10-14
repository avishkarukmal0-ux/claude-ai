# 2026-10-14 — /radius cold path: per-step timing + durable per-OA cache + centroid warm

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Domains-Index]] — Neighbourhood Insights (radius aggregation, Nomis adapter)
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
A cold `/radius` for SW1A 1AA took **32,372 ms for 119 OAs**; the repeat was 0 ms (in-memory result cache). The user asked for (1) per-step timing logs in the cold path, (2) an analysis of where the 32s goes, (3) fixes in order — parallel/batch Nomis (already done), **persist OA/dataset results in Mongo with no expiry**, optional pre-warm, optional background/timeout fallback — (4) keep the in-memory cache in front of Mongo, and (5) a separate write-up of what REDIS_URL-less mode does to sign-out.

## Changes
- **Per-step timing instrumentation**
  - `services/insightsData/nomis.js` — `fetchAreaProfiles` now records `timings` { `centroidsAlreadyLoaded`, `centroidsLoadMs`, `centroidCount`, `selectMs`, `oaSelected`, per-`tables[]`, `nomisTotalMs`, `aggregateMs`, `profileCacheHit` } and exposes `lastTimings()`. `fetchTable(def, oaCodes, rec)` fills `rec` with `{ table, dataset, oaRequested, oaFromMem, oaFromMongo, oaFetched, batches, ms, status, retryAfter }`. `fetchJson` captures `Retry-After` on an error.
  - `services/insightsService.js` — `computeProfile` times `resolveMs` + `totalMs` and merges `provider.lastTimings()` into the returned `diag.timing`.
  - `routes/pwaNeighbourhoodRoutes.js` — the existing one-line `/radius` log now includes `step` (resolve/centroid/select/nomis/aggregate ms + `centroidsWarm`) and a `tables` array (per-dataset req/mem/mongo/fetched/ms/status/retryAfter). WARN ≥ 8 s. Postcode still hashed, never logged raw.
- **Fix 3b — durable per-OA cache (no expiry)**
  - New model `models/InsightsOaData.js` — `{ dataset, oa, counts, fetchedAt }`, unique `{dataset,oa}`. Census 2021 is static → no TTL.
  - New `services/insightsData/oaStore.js` — two layers: **L1 in-memory Map in FRONT of Mongo L2**. `get(dataset, oaCodes)` returns known OAs from mem→Mongo; `put` write-throughs to both; empty `{}` results are stored so a dataless OA isn't re-queried. Best-effort: Mongo down → L1-only, caller still fetches Nomis.
  - `nomis.fetchTable` now fetches from Nomis **only the OAs missing from both layers**, then persists them. So a second lookup of any postcode sharing OAs — or the same postcode after a restart/deploy — skips Nomis for known OAs.
- **Fix 3c-ish — centroid warm at boot**
  - `server.js` — after `connectDB()` resolves, fire-and-forget `centroids.load()` (insights-gated, Mongo-source only) so the FIRST user `/radius` doesn't pay the ~190k-row centroid load.
- Tests: `__tests__/insightsData.test.js` — reset `oaStore` per test; new block (put/get round-trip incl. empty = known; fetchTable fetches each OA once then serves from store, only missing refetched; `lastTimings()` shape). Updated the “headline cache not reused for full” test: age/household now come from the OA cache on the later full request, so only the 5 breakdown datasets are refetched (data still correct).

## Analysis — where the 32 s goes (hypothesis, to confirm from the new log)
`fetchTimeoutMs` caps a single Nomis call at **15 s**, and headline age+household are fetched **in parallel**, so Nomis alone can contribute at most ~15 s. 32 s therefore can't be Nomis-only. The prime suspect is the **unbounded `centroids.load()`** — `OaCentroid.find({})` pulls ~190 k rows from Atlas into memory on the first call per process (no timeout). Rough cold budget: resolve ≤5 s + centroid load ~10–15 s + Nomis ~15 s ≈ 32 s. Not serial per-OA (119 OAs = one 150-batch) and not rate-limiting unless a `tables[].status` 429/`retryAfter` shows in the log. The new per-step line will confirm the split; `centroidsWarm:true` after the boot warm should remove the centroid chunk from user requests.

## Fixes mapping to the user's list
- (a) parallel/batch Nomis — already in place (mapLimit, 150/batch, concurrency 6); 119 OAs = 1 batch so it wasn't the bottleneck.
- (b) **done** — durable Mongo per-OA cache, no expiry, survives restart/deploy.
- (c) pre-warm — implemented the cheap half (centroid warm at boot). Postcode pre-warm (hitting common postcodes on boot) is a follow-up if wanted.
- (d) still-over-30s fallback — NOT changed. The server result cache + in-flight coalescing already make Retry instant after a slow first call. If the per-step log shows Nomis itself routinely >30 s, raise the client timeout to 45–60 s with a “this can take a minute the first time” message, or return area totals first and compute radius in the background. Recommend deciding after seeing the log.

## (5) Token blacklist / REDIS_URL-less mode — separate decision
- Two auth systems. The **PWA (Vendora POS) uses `pwaAuthService` + `Member.tokenVersion` in Mongo** — a staff revoke/password-reset bumps `tokenVersion` and every request re-checks it, so POS sign-out/revoke is **durable and unaffected by Redis**.
- The **web `authService`** (Staff access+refresh JWTs) uses a **Redis** key `blacklist:refresh:*` for logout + refresh rotation. With **no `REDIS_URL`**, `getRedis()` returns a no-op stub: `logout()`’s `set` is a no-op and `refreshTokens()`’s `get` returns null. So **a logged-out refresh token is still accepted until it expires (default 7 d)**; access tokens are 15 min JWTs and expire on their own. (This path isn’t wired to a live route in the PWA pilot, but the gap is real if the web auth is used.)
- Proposal (independent of the speed work): either provision Redis (`REDIS_URL`), or add a **Mongo TTL collection** `RevokedToken { jti/tokenHash, expiresAt }` with a TTL index on `expiresAt`, and have `logout`/`refreshTokens` check/write it. Mongo TTL needs no new infra and auto-expires rows. Recommend the Mongo TTL collection for the pilot. Not implemented — Avishka/owner’s call.

## Verification
- `npx jest insightsData insightsService` → **35 passed**. Modules load-check OK.
- Full backend suite: the 5 failing suites (auth, cashDrawer, lossPrevention, products, sales) are DB-backed and fail only because mongodb-memory-server can’t download its binary in this sandbox (`global.testStore` undefined) — pre-existing env limitation, not these changes; DB insights suites self-skip here and run in CI.
- CANNOT measure a live cold SW1A 1AA time (Render egress blocked). **Backend change → needs a manual Render deploy.** After deploy, the new per-step `/radius` log line gives the real split, and `centroidsWarm` shows whether the boot warm landed.
- The oaStore **Mongo L2** read/write path is covered by reasoning + the in-memory-layer unit tests; its Mongo branch runs only with a provider configured + Mongo present (not in the offline suite).

## Commit(s)
- `<hash>` — perf(neighbourhood): per-step /radius timing + durable per-OA Mongo cache + centroid warm

## Round 2 (same day) — live evidence + follow-ups from fc022b1
Live `diag.timing` confirmed fc022b1 is deployed: centroids 0 ms (warm), Nomis is the cost. E8 3DY (5,000 m, 2,000 OAs): 509 fetched in 4 batches, ~8.4 s + 9.3 s per (parallel) table, total 9.9 s. SE1 9SG: 55 fetched, 2.1 s. ~18 ms per MISSING OA → cost scales with OAs not yet cached. **`oaFromMongo` was 0 on first lookups** — expected (first fetch), but unverifiable without a write confirmation, so:
- `oaStore.put` now RETURNS `{ persisted }` and **logs a WARN on a Mongo write failure** (a silent failure is exactly what would keep `oaFromMongo` at 0). `fetchTable` records `rec.mongoPersisted` (+ `mongoError`).
- Route log/table rows now carry `persisted`, `persistErr`, and **`batchMs[]`** (per-batch wall time → Σ≈table ⇒ Nomis serialises; max≈table ⇒ truly parallel). The client already dispatches batches concurrently (mapLimit, conc 6); `batchMs` will show whether Nomis is the serialiser.
- **diag removed from the production `/radius` response** (item 3): kept in the server log; exposed to clients only in dev or with `INSIGHTS_DIAG_PUBLIC=true`.
- Not changed: radius stepping (d) — E8 3DY is already 9.9 s (< 10 s target) and repeats are cache-instant; hold unless a denser postcode exceeds target. Batch concurrency left at 6 (raising it risks Nomis 429 if it's the serialiser).
- Verify after deploy: `insightsoadatas` doc count before/after one cold `/radius`; `tables[].persisted` on that call; `oaFromMongo > 0` on a SECOND lookup of the same postcode after a restart.
Files: `services/insightsData/oaStore.js`, `services/insightsData/nomis.js`, `routes/pwaNeighbourhoodRoutes.js`. insights tests 35 pass. Backend-only → needs Render deploy.

## Round 3 — deploy visibility, auditable cache counts, RevokedToken blacklist
Audit found the live `/radius` no longer returned `diag` — correct: commit `50a9057` strips `diag` in production (so Render is serving ≥50a9057). But `persisted`/`oaFromMongo` lived inside `diag`, so the cache was no longer auditable from the response. Fixes:
- **`/version`** endpoint + a `commit` field on `/health` (from `RENDER_GIT_COMMIT`) so the serving build is checkable (`1e1218a`).
- **Always-on `cacheStats`** on `/radius` (even in prod, diag hidden): per-table `{ds, req, mem, mongo, fetched, persisted, persistErr}` + `durationMs` — counts/dataset ids only, no OA codes. Lets the audit confirm `persisted == fetched` (cold) and `oaFromMongo > 0` (repeat/after-restart) from the response alone (`1e1218a`).
- **Durable Mongo TTL refresh-token blacklist** (`060b8cd`, auth-only, separate commit): new `RevokedToken {tokenHash(sha256), expiresAt}` with a TTL index on `expiresAt`; `authService.refreshTokens`/`logout` check+write it alongside Redis, so sign-out holds with no `REDIS_URL`. 15-min access tokens unchanged. Test: after logout the same refresh token is rejected (CI, DB-backed).
Live cold `/radius` (build fc022b1+): centroids 0 ms (warm); Nomis is the whole cost at ~18 ms/missing-OA. Measured: E9 6PT 6.9s, E3 4PH 3.9s, E8 3DY 10.2s, N1 9GU 18s, E14 5AB 17.5s. Dense ones (N1 9GU, E14 5AB) miss the <10s target on a FULL cold fetch — expected to drop once the Mongo read path is confirmed filling (repeat/after-restart), since only first-ever OAs hit Nomis. Hold radius-stepping until that's confirmed.
insights tests 35 pass; auth modules load. Backend-only → needs Render deploy. Could NOT run DB-backed auth test locally (mongodb-memory-server binary blocked) — CI covers it.

## Round 4 — boot-window coalescing + blacklist clarity (audit confirmed speed fixed)
Live audit of `f6fe5ae`: cache verified — N1 9GU 207 OAs all-from-Mongo 0.54s (was 13–18s), E14 5AB 266 OAs 0.59s (was 17.5s), E8 3DY 488 OAs (444 mongo + 44 mem) 1.04s; cold EX4 3LS persisted 122 == fetched 122, persistErr null, survives restart. Speed signed off; **no radius-stepping**. Deploy log showed the centroid warm = **188,880 OAs in ~27s** at boot (the old hidden cold cost), now off the user path.
- **Boot-window fix:** `centroids.load()` now shares an in-flight promise (`_loading`) — a `/radius` arriving during the ~27s warm awaits the SAME load instead of starting a second ~190k Mongo pull. Chose the existing **boot warm** as the self-warm-up (no extra self-ping needed — the warm already pre-loads without a user). `server.js` logs warm start + `…warmed into memory (N) in Xms` so the boot/warm timing shows in the Render deploy log.
- **Token blacklist was already done** (`060b8cd` in `f6fe5ae`): the "token blacklisting disabled" log was just the Redis stub's hardcoded string. Updated that message in `config/redis.js` to: "Redis caching disabled; refresh-token revocation now uses the durable Mongo TTL blacklist" — so the log reflects reality. No auth-logic change this round.
- Verification of sign-out: the `auth.test.js` logout→refresh-rejected test asserts the exact requirement and runs in CI against real Mongo; it can't run in this sandbox (mongodb-memory-server binary blocked — it errors at `global.testStore`). On prod, a web logout inserts one doc into the `revokedtokens` collection (hash only); that's the observable check.
Files: `services/insightsData/centroids.js`, `server.js`, `config/redis.js`. centroids+insights tests 22 pass. Backend-only → needs Render deploy of the new tip.

## Follow-ups
- [ ] Deploy to Render; capture a cold SW1A 1AA `/radius` line and read the `step`/`tables` split; confirm `centroidsWarm:true` on user requests.
- [ ] If centroid load still shows on the first user request, consider a 2dsphere geo query so we never load all ~190k OAs into memory.
- [ ] Decide (d) timeout/background only if Nomis itself is the >30s part.
- [ ] Token blacklist: provision Redis or add the Mongo TTL `RevokedToken` collection — owner’s call.
