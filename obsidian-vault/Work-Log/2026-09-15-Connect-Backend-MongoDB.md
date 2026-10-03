# 2026-09-15 — Backend/MongoDB: ready-to-connect (health db status + runbook)

Back to [[Work-Log]] · Related: [[Connect-Backend-MongoDB]] · [[Deployment]] · [[Implementation-Roadmap]]

## Goal
Founder: "let's connect MongoDB." Finding: the code is **already wired** for it — connecting is a deploy/config task needing the founder's Atlas URI + hosting (can't be done from here without secrets/accounts). So: make it verifiable + hand over an exact runbook.

## What changed (files)
- ✏️ `backend/src/app.js` — `/health` (and `/api/health`) now report a **`db` status** (`connected`/`connecting`/`disconnected`) from `mongoose.connection.readyState`, so the connection can be verified instantly after deploy. Still always returns 200 (platform probe safe).
- 🆕 `obsidian-vault/Connect-Backend-MongoDB.md` — step-by-step runbook: Atlas cluster → Railway backend (env vars incl. `MONGODB_URI`, JWT secrets, CORS) → Vercel `VITE_API_URL`/`VITE_WS_URL` → verify via `/health` → optional seed. Includes the secret-safety warning and troubleshooting.
- ✏️ `Home.md` — linked the runbook under Foundations.

## Already wired (confirmed by reading)
- `backend/src/config/database.js` + `config/index.js` read `MONGODB_URI`, connect with retry + keepalive.
- `server.js` binds `0.0.0.0`, starts without blocking on DB, retries.
- `frontend/src/services/api.js` → `VITE_API_URL`; `hooks/useSocket.js` → `VITE_WS_URL`.
- Deploy configs present: `railway.json`, `Procfile`, `Dockerfile` (backend); `vercel.json` (frontend).

## Verification
- `node -e "require('./src/app.js')"` boots (after `npm install`; JWT warnings expected).
- Started `server.js` and curled `/health` → `{"status":"ok","db":"connecting",...}` (no local Mongo, so it retries — proves the field). With a real Atlas URI it reads `"connected"`.
- No local mongod available, so a live end-to-end connection can't be proven from here — that happens on the founder's deploy.

## Blocked on the founder (accounts/secrets — cannot be done from here)
1. MongoDB Atlas cluster + `MONGODB_URI` (secret).
2. Deploy backend to Railway with env vars.
3. Set Vercel `VITE_API_URL`/`VITE_WS_URL` + redeploy.
→ Runbook covers all three. Once live, next code step is syncing the local-first inventory/waste stores to the API.

## Commit
- feat(backend): report db status in /health; docs: MongoDB connect runbook
