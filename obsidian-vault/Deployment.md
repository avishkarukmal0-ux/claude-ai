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
