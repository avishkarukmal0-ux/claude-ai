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
