# Deployment

Back to [[Home]] · Related: [[Architecture]] · [[Tech-Stack]]

## Targets

| Part | Platform | Config file |
|---|---|---|
| Backend API | **Railway** | `backend/railway.json`, `backend/Procfile` |
| Frontend SPA | **Vercel** | `frontend/vercel.json` |
| Full stack (self-host) | **Docker Compose** | `docker-compose.yml`, `docker-compose.prod.yml`, `nginx.conf` |

## Backend (Railway)
- Start command: `node server.js` (`package.json` → `start`)
- Health probe: `GET /health` and `/api/health` — answered *before* all middleware so probes never fail during boot
- Env vars injected at runtime (secrets NOT baked in). App **warns** but does not exit on weak/missing `JWT_SECRET` because Railway injects vars after process start.

### Required env vars (backend)
- `JWT_SECRET`, `JWT_REFRESH_SECRET` (≥32 chars, strong)
- `MONGODB_URI` (Atlas)
- `REDIS_URL` (Upstash)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `CORS_ORIGIN` (comma-separated allowed origins)
- `FRONTEND_URL`
- `NODE_ENV=production`

> Generate a secret: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

## Frontend (Vercel)
- Build: `vite build` → `dist/`
- Talks to backend via `src/services/api.js` (axios base URL from env)

## CORS allow-list
`app.js` allows: explicit `CORS_ORIGIN` entries, `FRONTEND_URL`, and wildcard patterns for `*.vercel.app` / `*.railway.app`. Localhost allowed only in non-production.

## Security posture
- helmet + strict CSP (`connectSrc` allows MongoDB, Upstash, configured origins)
- HTTPS redirect in production
- Rate limiting on `/api`
- Audit logging on sensitive routes
- JWT auth + optional 2FA

## Notes / gotchas
- Do **not** `process.exit()` on missing env at boot — Railway injects vars late.
- `nginx.conf` is for the Docker/self-host path only.

## 💷 Hosting cost plan (free-trial ended 2026-07)

Railway's free trial credit expired (~6 months in). Key point: **compute hosting ≠ your data.** The DB is on **MongoDB Atlas M0 (free forever)** — data persists; a paused cluster just needs "Resume". See [[Running-Locally]].

**Recommended path (cost-optimised):**
1. **Now — Local only (£0):** run via `StartVendora.bat` pointed at the Atlas `MONGODB_URI`. Best while rebuilding. See [[Running-Locally]].
2. **When it needs to be online (£0):** Frontend → **Vercel**/**Cloudflare Pages** (free); Backend → **Render** free web service (sleeps ~15min idle, ~30s cold start); DB → **Atlas M0**; Redis → **Upstash** free (optional).
3. **Real 24/7 till (~$5/mo):** Railway Hobby or Render paid backend — always-on, no cold starts.

**Free-host env parity:** same vars as above — `MONGODB_URI`, `JWT_SECRET`/`JWT_REFRESH_SECRET` (strong), `CORS_ORIGIN` (the Vercel URL), `FRONTEND_URL`; frontend `VITE_API_URL` = backend URL + `/api`, `VITE_WS_URL` = backend URL.
- TODO when going live free: add a `render.yaml` for one-click backend deploy.

## 🌍 Scaling for ~100 shops × 3–7 staff (≈500–700 devices) — owner infra actions

These are **operator/console changes** (not code); the code-side scale hardening is done — see
[[2026-10-16-scale-sync-hardening]] (delta pull + ETag, per-shop rate limits, compression, adaptive poll).

1. **Co-locate compute with the data, and leave the free tier.** The backend is currently Render **free**
   in **Virginia (US-East)** while Atlas is **EU_WEST_1 (Ireland)** — every DB round-trip crosses the
   Atlantic (~70–90ms each), which compounds under load, and the free dyno cold-starts (~30s) and sleeps.
   Move the backend to a **paid Render instance in Frankfurt (EU Central)** (or the closest EU region) so it
   sits beside Atlas. Expect p95 to drop sharply once DB latency is local.
2. **Paid Atlas tier in the same region.** M0 (free) is shared and throttled. For 500+ devices polling, move
   to at least **M10 in eu-west-1** (dedicated, connection headroom, metrics). Keep the backend in the same
   cloud region as the cluster.
3. **Health check on `/healthz`.** Point Render's health check (and any uptime pinger) at **`/healthz`**
   (ultra-light `{ok:true}`, no DB) so a slow DB doesn't fail the liveness probe. `/health` still reports
   `db:"connected"` for a deeper check.
4. **Validate before launch:** run the k6 load test (`backend/scripts/loadtest/sync-load.js`) against
   **staging** at 700 devices — target p95 < 500ms, 0 × 429. **Staging only; never production.**

Cost note: this is the "real 24/7" tier — budget for a paid Render instance **plus** Atlas M10 (both EU).

### ⚠️ Scaling out requires shared rate-limit + lockout state

The API's rate limiters (`middleware/rateLimit.js`, express-rate-limit **MemoryStore**) and the login lockout
(`services/pwaAuthService.js`, an in-memory `Map`) are **per process**. On ONE instance that's correct. The
moment you run **more than one** Render instance (horizontal scale / autoscaling), each process keeps its own
counters, so the effective caps multiply by the instance count and the lockout only sees a fraction of the
failures — i.e. the limits silently weaken. **Before** increasing instance count:

1. **Rate limiters → Redis.** `npm install rate-limit-redis` and set `REDIS_URL` (e.g. Upstash). The code is
   already wired: `makeStore(prefix)` in `rateLimit.js` returns a Redis-backed store (own key prefix per
   limiter) once BOTH that package and `REDIS_URL` are present; otherwise it falls back to MemoryStore. No code
   change needed — just install + env — but **load-test the limited routes once enabled** (this path isn't
   exercised on the single-instance setup).
2. **Login lockout → shared store.** Move the `_loginFails` map in `pwaAuthService.js` to Redis (a key per
   `email|ip` with a TTL = the lockout window) or a small Mongo collection. It's deliberately isolated behind
   `assertNotLockedOut` / `noteLoginFailure` / `noteLoginSuccess`, so this is a localized change.
3. Keep `app.set('trust proxy', 1)` correct for the instance topology so `req.ip` (the limiter/lockout key)
   is the real client IP, not the load balancer's.

Until all three are done, **pin the service to a single instance.** The member-status cache (30s) and the
sync ETag are fine multi-instance (eventually consistent / derived from Mongo), so they need no change.

### ⚠️ Free-plan cold start (idle spin-down)

Render's **free** web service **sleeps after ~15 min idle**. The next request wakes it, and the shopper waits
for: container resume + Node boot (~20s observed) — the request that triggered the wake is the one that eats
it. That's the **dyno wake**, inherent to the free plan.

The OA-centroid load (~28s for 188k rows) is **NOT** run at boot — doing so starved the single (throttled)
worker and made logins/sync/`/healthz` slow for ~60s after every restart (bug, fixed 2026-10-18). Instead it
loads **lazily on the first `/radius` request**: that request kicks the load off in the background (streamed
from Mongo in ~2k batches with event-loop yields) and returns `503 warming_up` + `Retry-After` immediately;
retries get 503 until it's ready. So login/sync/`/healthz` are **never** blocked by it. `/healthz` answers 200
immediately (no DB, before all middleware). An operator on a paid **always-on** instance (rare restarts, wants
the first `/radius` fast) can opt back into boot-warming with **`INSIGHTS_WARM_AT_BOOT=true`**.

Fix (pick one):
- **Keep it warm (free):** point **UptimeRobot** (or any pinger) at **`GET /healthz` every 5 min** — under the
  ~15-min idle window, so the dyno never sleeps. `/healthz` is the right target (ultra-light, no DB). The
  per-5-min `traffic:` log line makes these pings visible.
- **Paid plan:** a paid Render instance doesn't sleep (and, per the scale-out section, should be the EU
  Frankfurt + Atlas M10 setup for latency anyway).

Don't ping `/health` (it touches Mongo state) or `/radius` (heavy) for keep-warm — use `/healthz`.

**Keep-warm is wired for us (public repo):** `.github/workflows/keep-warm.yml` curls `/healthz` every 10 min
and fails unless it's 200. This only exists because the repo is **public** (Actions minutes are unbilled);
if it ever goes **private**, delete that workflow and use UptimeRobot instead — every-10-min pings would
exceed the 2,000 free private-repo minutes/month.

## 🧪 Staging backend (Render Blueprint — `vendora-pos/render.staging.yaml`)

Create the staging service **from the Blueprint, not by hand** — the earlier staging service
(`srv-dbab6hs9v7es73fs029g`) failed to build twice because its **Root Directory was left empty**, so Render
ran `npm install` at the repo root instead of in `vendora-pos/backend`. The Blueprint sets `rootDir`, so this
can't happen again.

Steps (one-time):
1. Render dashboard → **New > Blueprint**.
2. Connect this repo and branch `claude/vendora-pos-v3-KPnI0`; point it at **`vendora-pos/render.staging.yaml`**.
3. Apply. It creates **`vendora-staging`** (web, node, free, **frankfurt**, `rootDir: vendora-pos/backend`,
   build `npm install`, start `node server.js`, health `/healthz`, `autoDeploy: false`).
4. The three secrets are `sync: false` (never in git) — set **MONGODB_URI**, **JWT_SECRET**,
   **JWT_REFRESH_SECRET** in the dashboard after creation. `NODE_ENV=production` is already set by the Blueprint.
5. Deploys are manual (`autoDeploy: false`) — trigger from the dashboard or the Render MCP when you want to
   test a branch. **Staging is for load tests / pre-release checks only — never point shoppers at it.**

If the existing empty-rootDir service is still around, delete it and recreate from the Blueprint rather than
editing its Root Directory field by hand.
