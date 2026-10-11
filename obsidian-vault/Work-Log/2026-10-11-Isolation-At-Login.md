# 2026-10-11 (part 7) — Isolation starts at login: gate the PWA behind a shop sign-in

Back to [[Work-Log]] · [[Home]]

**Domain(s):** Auth / PWA entry · Security
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Context
Owner: *"there should be a barrier between the shops — I can move shop to shop without the login and see everything in
there. Each and every shop has to be isolated from login itself."*

### What I verified (the backend is NOT leaking)
- **Sync is fully account-scoped.** `verifyAccess` derives the account id from the signed token (`req.pwa.sub`), never from
  client input; every `pull`/`push`/history/restore query filters `{ account: <token id> }`. A logged-in shop cannot read or
  write another shop's blobs via the API (isolation tests cover this).
- **On login the local workspace switches** to `shopWorkspace(shopId)` and a genuine account switch purges the previous
  shop's cached data (Phase 1.4).

### The real gap (root cause)
The **PWA had no login gate at all.** The front door is `NichePickerPage` (pick a shop *type*) → `/home`, and the whole app
ran in a single **guest workspace** with login *optional* (only the deferred till screens were behind `ProtectedRoute`). So
anyone could open the app and use/see data without authenticating — the per-shop barrier only existed *after* someone chose
to log in. That's the "move shop to shop without login and see everything."

## Change (minimal, reversible, self-safe)
- New `components/account/RequireShopLogin.jsx` — a route guard: when **accounts are enabled** and **no shop is signed in**,
  it `<Navigate to="/account">` (the screen that offers **Log in** AND **Create account**); once signed in it renders the
  app. `enabled` is injectable for tests; defaults to `ACCOUNTS_ENABLED`.
- `App.jsx` — wrapped the app/data route: `/home` → `<RequireShopLogin><HomePage/></RequireShopLogin>`. The picker (`/`) and
  the account screen stay public (they show no shop data).
- Did **not** touch the auth service, token logic, or Brevo — only added a front-of-app gate that *uses* the existing
  session check. No backend change.

## Safety / why it can't lock anyone out
- The gate is **only active when `ACCOUNTS_ENABLED`** (there is a backend to log into). With accounts disabled there's no
  login to require and only one local workspace exists (no other account's data to expose), so the app stays open.
- Existing signed-in shops are unaffected. A guest who was trialing is sent to sign in/create a shop; the existing
  **explicit guest→shop migration** still offers to bring their on-device data into the new shop.

## ⚠️ Requires to actually take effect
`VITE_ACCOUNTS_ENABLED=true` in the Vercel env (and the `/api/pwa-auth` backend live). If accounts are currently **off**, the
gate is a no-op by design — turning the flag on is what enforces the login barrier. (Flag owned by the owner; not changed here.)

## Verification
- New `RequireShopLogin` test 3/3 (signed-out→login screen, signed-in→app, accounts-off→no lockout).
- FE full suite **393/393** (+3) + build green. SW bumped **v7→v8** so installed PWAs pick up the gate.

## Rollback
- `git revert <sha>` — isolated (one guard component + one route wrap).

## Next step for the owner
1. Ensure **`VITE_ACCOUNTS_ENABLED=true`** in Vercel (redeploy). With it on, opening the app signed-out shows the shop
   login/create screen first — no data until a shop logs in.
2. Reload / reopen the PWA (SW v8 → Refresh prompt) to get the gate.

## Commit(s)
- `feat(auth): require shop login to open the PWA — isolation starts at login (+SW v8)`

## Update — gated the welcome/picker too (after owner's screen recording)
Owner sent a recording (`11.mp4`, on `claude-ai-indol.vercel.app`, signed out) showing the exact hole: from "Welcome to
Vendora" they tap into the full app (`/home`) and freely switch shop *type* (Convenience → Off-licence → Butcher → Health-
food), using the app with **no login ever asked**. (It's one open guest workspace with a switchable type label, but the real
issue — the app is usable with no login barrier — is valid.) Confirmed this was the **pre-gate build**.
- `App.jsx`: now **both** `/` (NichePicker) and `/home` are wrapped in `RequireShopLogin`, so a signed-out visitor hits
  `/account` (log in / create) FIRST — they can't even tap through the picker. Only `/account` stays public.
- No loop: a logged-in user with no shop type set still reaches `/` (HomePage redirects there when `!saved`; the guard lets a
  logged-in user through) to pick a type, then `/home`.
- SW bumped **v8→v9**. FE **393/393** + build green.

## Follow-ups
- [ ] Owner decision: keep a signed-out **demo** path, or require login for the demo too (demo now sits behind login).
- [ ] Optional: one-time wipe of any leftover **guest workspace** data from the pre-gate era (local per-device only).
