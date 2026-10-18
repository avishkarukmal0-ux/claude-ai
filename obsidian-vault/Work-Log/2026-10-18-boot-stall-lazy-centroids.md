# 2026-10-18 — BUG: ~60s boot stall — centroid warm moved off the boot path

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Backend-Overview]] — insights centroid warm, server boot; [[Deployment]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Bug
After every (re)start the API was unresponsive for ~60s. Measured post-`08f6290` (11:28Z): `POST /pwa-auth/login`
took 10.5s / 19.6s / 33.6s (two 60s curl timeouts), `GET /healthz` 21s; ~60s later login 0.5s, healthz 0.3s.
Cause: the OA-centroid warm-up (188,880 docs, ~28s) ran at boot (fire-and-forget after `listen()`), but on the
throttled free-tier single worker the BSON materialisation + GC churn starved the event loop — even `/healthz`
(no DB) stalled. The earlier cursor-streaming change (`fd4ea77`) helped memory but still spent ~28s of warm CPU
competing with every request on one throttled core.

## Fix — don't warm at boot; load lazily, streamed, with a fast 503
- **server.js:** removed the boot warm from the default path. It now only runs when
  **`INSIGHTS_WARM_AT_BOOT=true`** (opt-in for a paid always-on instance where restarts are rare and the first
  `/radius` should be fast). Default boot is instant — no centroid work.
- **pwaNeighbourhoodRoutes `radiusHandler`:** the first `/radius` that needs centroids now **kicks the load off
  in the background** (fire-and-forget, coalesced) and returns `503 warming_up` + `Retry-After` immediately,
  instead of `await`-ing the ~28s load inline (which would brush the client's 30s timeout). Retries get 503
  until ready, then succeed. `nomis.js` still `await centroids.load()` in the pipeline (returns cached once
  warm), so nothing else changed.
- **centroids.loadFromMongo:** yield cadence tightened `10000 → 2000` rows (≈ one Mongo batch) so the lazy warm
  interleaves even more finely on a throttled core.
- `/healthz` unchanged — already 200 immediately (registered before all middleware, no DB).

## Acceptance
New `centroidsMongo.test.js` case **"releases the event loop during the warm"**: with a 60k-row stream, a
callback scheduled right after the warm starts (a stand-in for a `/healthz` or `/login` handler arriving mid-warm)
runs **before** the warm finishes — the deterministic proxy for "login/healthz stay responsive (<1s) during
warm-up" on the single worker. (A real wall-clock <1s assertion needs the live throttled instance; this proves
the loop is released.)

## Decisions
- Pure lazy (no boot warm) over a worker_thread / precomputed typed-array file: smallest change, and the warm
  is a rare, one-off cost on the first `/radius` of a session — the neighbourhood feature is a paid add-on, not
  on the login/sync hot path. Kept the streamed+yielding load so even that one request's warm stays gentle.
  The worker_thread / compact-file options remain open if `/radius` ever needs sub-second first response.

## Verification
- Backend boots clean (no centroid work at boot by default). Unit: `centroidsMongo` (4) + `centroids` (6) +
  insights/neighbourhood suites (74) + `scaleHardening`/`requestMetrics`/`pwaStoreAccess`/`pwaNotify` — all green.
- ⚠️ The wall-clock "<1s during warm" acceptance is best re-measured on the live free instance after this
  deploy: hit `/healthz` and `/login` right after a restart — they should now be fast immediately (no boot warm),
  and the first `/radius` should return a quick `503 warming_up`.

## Commit(s)
- `1d98cac` — fix(perf) boot stall + docs.

## Follow-ups
- [ ] Re-measure post-deploy: login/healthz fast immediately after restart; `/radius` returns quick 503 then warms.
- [ ] (open) worker_thread or precomputed compact centroid file if first-`/radius` latency ever needs to be ~0.
