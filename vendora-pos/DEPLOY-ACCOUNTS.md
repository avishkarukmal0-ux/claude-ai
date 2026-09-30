# Turn on shop accounts — plain checklist

Goal: put the accounts server online (Render), point the app at it, and switch the login on.
You do the clicks (they need your accounts + secrets); the code is already ready. ~15 minutes.

Nothing here is destructive, and until the very last step no shop owner sees a login.

---

## Part A — Put the server online (Render) · ~10 min

1. Go to **render.com** and sign up (free). Click **New +** → **Web Service**.
2. **Connect GitHub** and pick the repo **`avishkarukmal0-ux/claude-ai`**.
3. Fill in the settings **exactly**:
   - **Name:** `vendora-api` (anything is fine)
   - **Branch:** `claude/vendora-pos-v3-KPnI0`
   - **Root Directory:** `vendora-pos/backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance type:** **Free**
4. Open the **Environment** section and add these variables (click "Add Environment Variable" for each):

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | your Atlas connection string **with the real password** (the `vendora_test` cluster is fine for the pilot) |
   | `JWT_SECRET` | a long random string (see below) |
   | `JWT_REFRESH_SECRET` | a **different** long random string |

   To make the two secrets, run this **twice** in PowerShell and copy each result:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```
5. Click **Create Web Service**. Wait for it to say **Live** (first build ~2–3 min).
6. In **MongoDB Atlas → Network Access**, add **`0.0.0.0/0`** (allow from anywhere). Render's free tier
   doesn't have a fixed IP, so this is needed for it to reach your DB. (Fine for a pilot DB; tighten later.)
7. **Test it:** open `https://<your-service-name>.onrender.com/health` in a browser.
   You want to see `db: "connected"`. If so, the server is up. ✅

> Note: the free tier **sleeps after ~15 min idle**, so the *first* login after a quiet spell can take
> 30–60 seconds to wake. Totally fine for a pilot.

---

## Part B — Point the app at it + switch login on (Vercel) · ~3 min

1. Go to **Vercel → your `claude-ai` project → Settings → Environment Variables**.
2. Add these two (scope: **Production**):

   | Key | Value |
   |-----|-------|
   | `VITE_API_BASE` | `https://<your-service-name>.onrender.com` (no trailing slash) |
   | `VITE_ACCOUNTS_ENABLED` | `true` |

3. Go to **Deployments → ⋯ → Redeploy** (so the new variables take effect).
4. Done. In the live app, **More → Settings → Your shop account** now appears, and create‑account /
   login talk to your Render server.

---

## Part C — Check it works

- Open the live app → **More → Settings → Your shop account** → **Create account** → it should sign you
  in and offer to move your on‑device data into the shop.
- If it fails:
  - `…onrender.com/health` not `connected` → check `MONGODB_URI` + Atlas Network Access.
  - Login button missing → `VITE_ACCOUNTS_ENABLED` not `true`, or you didn't redeploy.
  - Network/blocked error on login → `VITE_API_BASE` wrong, or the server is still waking (retry once).

## To switch accounts back OFF
Set `VITE_ACCOUNTS_ENABLED` to `false` in Vercel and redeploy. The login entry disappears; no data is lost.

## Security notes
- `MONGODB_URI` and the two JWT secrets live **only** in Render's env — never in the code or git.
- For real paying shops later: use a **dedicated production Atlas cluster** (not `vendora_test`) and
  tighten Atlas Network Access. Add `REDIS_URL` if you want token‑blacklist/caching back on.
