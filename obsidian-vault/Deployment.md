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
