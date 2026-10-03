# 🔌 Connect the Backend + MongoDB — setup runbook

Back to [[Home]] · Related: [[Deployment]] · [[Running-Locally]] · [[Implementation-Roadmap]]

> **The code is ready.** The backend already reads `MONGODB_URI` and the frontend reads `VITE_API_URL` / `VITE_WS_URL`. Connecting the real database is **3 account steps** — no new code. Follow these in order. **⚠️ Never paste your `MONGODB_URI` or passwords into chat or commit them — they're secrets. Only set them as environment variables in the hosting dashboards.**

After this, the local-first features (inventory, waste) can sync, and real MTD/owner numbers become possible.

---

## A. MongoDB Atlas — the database *(~10 min, free)*
1. Sign up at **mongodb.com/cloud/atlas** → create a **free M0 cluster** (region: London / `eu-west-2`).
2. **Database Access** → Add New Database User → username + a strong password. **Save the password.**
3. **Network Access** → Add IP → allow **`0.0.0.0/0`** (anywhere) for now — the backend host's IP isn't fixed.
4. **Connect → Drivers** → copy the connection string. It looks like:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxx.mongodb.net/?retryWrites=true&w=majority`
5. Replace `PASSWORD` with your real password and insert the DB name before the `?`:
   `…mongodb.net/vendora?retryWrites=true&w=majority`
   → **This whole string is your `MONGODB_URI`.** Keep it secret.

## B. Railway — run the backend always-on *(~10 min)*
1. Sign up at **railway.app** → **New Project → Deploy from GitHub repo** → pick this repo.
2. Set the service **root directory** to `vendora-pos/backend` (Settings → Root Directory). Railway auto-detects `railway.json` (start `node server.js`, healthcheck `/health`).
3. **Variables** — add:
   - `MONGODB_URI` = your Atlas string from step A
   - `JWT_SECRET` = a 64-char random hex *(generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)*
   - `JWT_REFRESH_SECRET` = a second, different random hex
   - `NODE_ENV` = `production`
   - `FRONTEND_URL` = your Vercel URL (e.g. `https://claude-ai-indol.vercel.app`)
   - `CORS_ORIGIN` = same Vercel URL
4. Deploy. Railway gives a public URL like `https://vendora-backend-xxxx.railway.app`.

## C. Vercel — point the frontend at the backend *(~5 min)*
1. Vercel project → **Settings → Environment Variables**:
   - `VITE_API_URL` = `https://<your-railway-url>/api`
   - `VITE_WS_URL` = `https://<your-railway-url>`
2. **Redeploy** the frontend (Vite bakes env vars in at build time — a redeploy is required).

## D. Verify it's connected
- Open **`https://<your-railway-url>/health`** → you should see **`"db":"connected"`** *(the field we added; "connecting"/"disconnected" means the URI/Network-Access is wrong)*.
- On the app, logging in / hitting the API should now work against real data.

## E. First data (optional)
- Seed sample data: in the backend, `npm run seed` (uses `src/utils/seedData.js`) — run locally against the Atlas URI, or as a one-off Railway command.

---

## What's already wired (so you know it's just config)
- Backend `src/config/database.js` → `mongoose.connect(config.mongodb.uri)` with retry + keepalive; `config/index.js` reads `MONGODB_URI`.
- `server.js` binds `0.0.0.0` (Railway-ready), starts even if DB is briefly down, retries.
- Frontend `src/services/api.js` → `VITE_API_URL`; `src/hooks/useSocket.js` → `VITE_WS_URL`.
- `/health` now returns a `db` status for instant verification (added 2026-09-15).

## Troubleshooting
- `db:"disconnected"` → check Atlas **Network Access** allows `0.0.0.0/0` and the password in the URI is URL-encoded (special chars like `@`, `#` must be `%40`, `%23`).
- CORS errors in the browser → `CORS_ORIGIN` / `FRONTEND_URL` on Railway must exactly match the Vercel domain.
- Login works but socket doesn't → check `VITE_WS_URL` and that you redeployed the frontend after setting it.
