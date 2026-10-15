# 2026-10-15 — Pre-launch API hardening (backend)

Canonical line (`ebd54ca`…). Backend-only; no frontend/SW change.

1. **`cacheStats` off in production** (`routes/pwaNeighbourhoodRoutes.js`): the POST/GET `/radius` response only
   includes `cacheStats` when `exposeDiag` is true (dev, or an explicit `INSIGHTS_DIAG_PUBLIC=true`). In
   production it's gone — no internal cache counts / dataset ids ship to live clients.
2. **`INSIGHTS_TEST_UNLOCK` hard-off in production** (`config/index.js`): `testUnlock` is now
   `NODE_ENV !== 'production' && INSIGHTS_TEST_UNLOCK === 'true'` — so even if the var is set in the prod env,
   it's ignored and the radius figures stay behind the paid entitlement (403 for non-entitled). Could not read
   the Render env via MCP (the env tool is merge-write only, no read), so this is enforced in code; recommend
   also removing the var in the Render dashboard › Environment.
3. **`GET /healthz`** (`app.js`): returns `200 {ok:true}` with no DB access / no work — a cheap liveness probe
   for an uptime pinger or Render health check. (The richer `/health` and `/version` are unchanged.)

## Verify
- `node -e "require('./src/app.js')"` loads clean (JWT dev warnings expected locally).
- Render autoDeploy is **off** → a manual deploy is required after this lands.
