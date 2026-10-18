# 2026-10-18 — Cold start: non-blocking centroid warm + free-plan keep-warm note

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Backend-Overview]] — insights centroid warm, [[Deployment]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

Deploy-log + idle-test re-audit. Items 1–3 (prod audit fix + CI gate, native bcrypt, RSS + 5-min traffic line)
were already shipped — see [[2026-10-18-deploylog-audit-bcrypt-metrics]] (`9eb8e9f`). This is **item #4 (cold
start)**.

## Already satisfied (verified, no change)
- `/healthz` returns **200 immediately** — registered before helmet/CORS/rate-limit/all middleware, no DB.
- `/radius` already returns **`503 warming_up`** + `Retry-After` while `centroids.isLoading() && !isLoaded()`
  (`pwaNeighbourhoodRoutes.js`), so it never hangs on the warm.
- The boot warm-up is **fire-and-forget** (not awaited) and coalesced, so login/sync never *logically* wait.

## Changed — the warm no longer spikes the event loop
`centroids.loadFromMongo` buffered all ~188k rows (`.lean()`) then did one big synchronous `.filter().map()` —
a multi-hundred-ms sync spike that could delay concurrent `/healthz`/login/sync during the ~28s warm. Rewrote
it to **stream with a cursor** (`.lean().batchSize(2000).cursor()`), building the list incrementally and
**yielding to the event loop every 10k rows** (`setImmediate`). Two wins: lower peak memory (no giant
intermediate array beside the list — helps the 512MB instance) and a responsive event loop throughout the
warm. So "login and sync never wait on it" now holds at the event-loop level, not just logically.

## DEPLOY note (free-plan cold start)
Added to [[Deployment]]: Render **free** sleeps after ~15 min idle; the ~20s cold start is the **dyno wake**
(container resume + Node boot) that the triggering request eats — **not** our warm-up. Fix: **UptimeRobot on
`GET /healthz` every 5 min** (under the idle window; ultra-light target) to keep it awake, or the paid plan.
Don't keep-warm via `/health` (touches Mongo) or `/radius` (heavy).

## Decisions
- Didn't make the warm fully "lazy" (only on first /radius) — a background boot warm is better UX (first
  /radius isn't the one that pays the 28s), and it's already non-blocking. The real cold-start cost is the
  dyno wake, addressed by the keep-warm note.

## Verification
- Backend boots clean; `centroids.test.js` 6 green. **Gap filled:** new `centroidsMongo.test.js` (3) drives the
  cursor-streaming warm with a faked connected mongoose + a mocked `OaCentroid` whose `.cursor()` is an async
  generator — covering row filtering, the >10k event-loop yield branch, and the empty-collection reason,
  without a live DB. No behaviour change to `/healthz` or `/radius` contracts.
- The streaming warm's real-world memory/latency effect is still best confirmed against the live ~188k-row
  Mongo — watch the next deploy's warm line (`rss=…`) and that `/healthz` stays fast during the warm.

## Commit(s)
- `fd4ea77` — perf/docs cold start.

## Follow-ups
- [ ] Set up UptimeRobot on `/healthz` (every 5 min) for the free plan, or move to paid.
