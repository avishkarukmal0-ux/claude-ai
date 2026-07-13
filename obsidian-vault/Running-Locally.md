# Running Locally & Railway Access

Back to [[Home]] · Related: [[Deployment]] · [[Tech-Stack]] · [[2026-07-13-Login-Store-Picker]]

## A. Log into the DEPLOYED (Railway) instance right now

The currently-deployed build still asks for a **Store ID**. Get it from your database, then log in with the demo owner account.

**Easiest — MongoDB Atlas dashboard:**
1. Open your Atlas project → **Browse Collections** → database (e.g. `vendora-dev`) → **`stores`** collection.
2. Copy the store's **`_id`** (the long hex string).
3. On the login screen paste it into **Store ID**, then: Employee ID `EMP001`, PIN `1111` (or email `raj@rajsofflicence.co.uk` / password `owner123`).

**Alt — Railway CLI:** `railway run node -e "require('dotenv').config();const m=require('mongoose');m.connect(process.env.MONGODB_URI).then(async()=>{const S=require('./src/models/Store');console.log((await S.find({},'name')).map(x=>x.name+'  '+x._id).join('\n'));process.exit()})"`

> Once the branch with the **store picker** ([[2026-07-13-Login-Store-Picker]]) is deployed to Railway, this whole step disappears — the login shows a **store dropdown** and auto-selects if there's one shop.

## ⭐ Windows one-click launcher (recreates "StartVendora")

For running your **real shop** locally on Windows (no demo data). `StartVendora.bat` lives at the repo root.

1. **Clone the repo** to a folder, e.g. `C:\Users\lenovo\OneDrive\Desktop\StartVendora` (the repo root — the one containing `vendora-pos\` — should be that folder). Also `git checkout claude/vendora-pos-v3-KPnI0`.
2. **Install Node.js LTS** from https://nodejs.org (once).
3. **Double-click `StartVendora.bat`.** First run it will:
   - create `vendora-pos\backend\.env` and open it in Notepad → paste your **`MONGODB_URI`** from **Railway → backend service → Variables** (this is what connects local to your *real* shop data — no seeding).
   - create `vendora-pos\frontend\.env` (defaults fine),
   - `npm install` both sides (first run only),
   - start backend + frontend, and open **http://localhost:5173**.
4. Log in: pick your store from the dropdown → `EMP001` / `1111`.

Next time: just double-click `StartVendora.bat` — it skips setup and launches.

**Tips**
- Running from a **OneDrive**-synced folder can make OneDrive churn on `node_modules`. If it feels slow, pause OneDrive sync while working, or clone to `C:\Vendora` instead.
- Because local points at the **same Atlas DB as Railway**, your edits affect live data. Do **not** run `npm run seed` here.
- Getting `MONGODB_URI`: Railway dashboard → your project → the **backend** service → **Variables** tab → copy the `MONGODB_URI` value.

## B. Run on your own machine (manual / cross-platform)

### Prereqs
- Node.js 18+ and npm
- Either Docker (easiest) **or** a local MongoDB. Redis is optional (PIN lockout degrades gracefully without it).

### Option 1 — Docker Compose (recommended, one command)
Spins up Mongo + Redis + backend + frontend together.
```bash
cd vendora-pos
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
docker compose up --build
# first time only — seed demo data (new terminal):
docker compose exec backend npm run seed
```
- Frontend → http://localhost:5173  · Backend → http://localhost:3001
- Log in: pick the store from the dropdown (or Store ID from seed output), `EMP001` / `1111`.

### Option 2 — Manual (no Docker)
Needs a MongoDB running locally (`mongodb://localhost:27017`) or an Atlas URI.
```bash
# 1. Backend
cd vendora-pos/backend
cp .env.example .env         # edit MONGODB_URI if using Atlas; set strong JWT secrets
npm install
npm run seed                 # creates demo store + accounts (fresh DB only!)
npm run dev                  # http://localhost:3001

# 2. Frontend (new terminal)
cd vendora-pos/frontend
cp .env.example .env         # VITE_API_URL defaults to http://localhost:3001/api
npm install
npm run dev                  # http://localhost:5173
```

### Which database?
- **Separate local DB (recommended):** safe sandbox; run `npm run seed` once → demo store + logins below.
- **Same as Railway (Atlas URI in `backend/.env`):** identical data & logins to production, but **dev changes hit live data** — be careful. Don't run `npm run seed` against it (it's for empty DBs).

### Env vars that matter
| Var | Where | Note |
|---|---|---|
| `MONGODB_URI` | backend/.env | local Mongo or Atlas connection string |
| `REDIS_URL` | backend/.env | optional locally |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | backend/.env | any string locally; **strong** in prod |
| `VITE_API_URL` | frontend/.env | backend URL + `/api` (default localhost:3001) |
| `VITE_WS_URL` | frontend/.env | backend URL for Socket.io |
| `CORS_ORIGIN` | backend/.env | must include the frontend origin (localhost:5173) |

## Demo logins (seeded)
Store **Raj's Off-Licence**:
| Role | Employee ID | PIN | Email / Password |
|---|---|---|---|
| Owner | `EMP001` | `1111` | raj@rajsofflicence.co.uk / `owner123` |
| Manager | `EMP002` | `2222` | sarah@rajsofflicence.co.uk / `manager123` |
| Supervisor | `EMP003` | `3333` | — |
| Cashier | `EMP004` | `4444` | — |

## Gotchas
- `.env` files are git-ignored — they don't come with a clone; copy from `.env.example`.
- `npm run seed` is for a **fresh/empty** DB (demo data). Don't run it on a shop with real data.
- No Redis locally = fine; PIN-lockout just no-ops.
