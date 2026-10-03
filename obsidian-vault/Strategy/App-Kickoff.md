# 🚀 App Kickoff — START HERE in a fresh tab ⭐

Back to [[Home]] · Related: [[Go-To-Market]] · [[Features-To-Build]] · [[Winning-Strategy]] · [[Two-Setups-Till-and-App]] · [[Niche-Pain-Research]]

> **Read this first in a new session.** This is the single hand-off note for building the **Phase-1 mobile app** (the "land" half of land-and-expand). It carries the whole plan in one page so a fresh tab can start building without re-reading the vault. Everything here is decided; the open questions are flagged at the bottom.

---

## In one line
Ship a **low-friction phone app** that runs *alongside* the shop's existing till (zero switching cost), kill one hated chore so they open it daily, earn **trust + data + market**, then launch the till later as a warm upsell. See [[Go-To-Market]].

## The daily hook (lead with this)
The **cash-&-carry / goods-in scan**: scan the trolley on arrival → stock + costs update. It kills a genuinely hated weekly chore, so they open the app on every wholesaler run. This is the wedge — build it well before anything else.

## What the app is / isn't (scope, from [[Two-Setups-Till-and-App]])
- ✅ **Is:** inventory + goods-in scan + expiry/waste + suppliers + owner glance + MTD-ready books. On the owner's own phone.
- ❌ **Isn't:** it does **not** take payments or ring sales — all card/sales stay on the counter till (that's Phase 2). Sales-driven insights (theft £, real margin) are the Phase-2 upsell, not in the app.

## The two guardrails (from [[Winning-Strategy]])
1. **Burden-first, not feature-first.** Every feature must name: which burden it kills + hours/week saved + £/month protected. If it can't, cut it.
2. **One shared core, per-shopType interface.** Build ONE app; a `shopType` dial + module registry shows Core + (plan) + (shopType). Never fork per vertical, never `if (shopType===…)` spaghetti.

---

## Build order (do them in this sequence — from [[Features-To-Build]])
**Step 0 — decide the shell:** PWA (mobile web, reuses existing frontend code, no capital — the likely pick) **vs** React Native. *Open decision — resolve before scaffolding.*

**Step 1 — Common Core (build once, every shop gets it):**
1. ♻️ **Goods-in scan → on-arrival confirm** — the daily hook. ~70% exists (invoiceReader template). One `stockMovementService.receive()` that increments stock + updates cost on "Received"; unknown-barcode quick-create.
2. 🆕 **MTD for Income Tax export** — auto-capture sales + expenses → MTD-ready quarterly figures. *(Legally forced Apr 2026, universal — the top wedge.)*
3. 🆕 **Demand forecasting (forecast-to-order)** — cut over/under-ordering.
4. ♻️ **Dynamic markdown suggestions** on top of existing expiry rules.
5. 🆕 **Migration/onboarding import** — pull products/prices from old EPOS/spreadsheet in minutes (kills the #1 switching barrier).

**Step 2 — App faces (mostly re-surfacing built code on mobile):**
- ♻️ Owner pocket view — reuse [[Overview-Dashboard]] + nightly "shop closed fine".
- ♻️ Worker view — expiring-soon + trends; wire MarketIntel's dead buttons.
- 🆕 Suggest-to-owner loop — worker flags "stock this"/"mark down" → owner inbox.
- ♻️ Mobile goods-in scan + ♻️ mobile stock-take (reuse `StockTake`).

**Step 3 — shopType architecture (enables everything after):**
- ♻️ `shopType` dial on the store — extend `PLAN_FEATURES` in `backend/src/models/Subscription.js`.
- 🆕 Module registry — config maps shopType → modules; smart default at signup + owner toggle.

**Later — Vertical modules** ([[Features-To-Build]] §D): bolt on ONE at a time, chosen by [[Customer-Discovery]] evidence. Off-licence + mini-mart are already covered. Do **not** build these speculatively.

## Where the code is
- Backend entry: `vendora-pos/backend/server.js` → `src/app.js` → `src/routes/index.js`
- Frontend entry: `vendora-pos/frontend/src/main.jsx` → `App.jsx`
- Feature flags to extend: `backend/src/models/Subscription.js` (`PLAN_FEATURES`)
- Full built-feature map: [[Feature-Inventory]] · house rules: [[Conventions]] / `CLAUDE.md`

## House rules (don't trip these)
- Branch `claude/vendora-pos-v3-KPnI0`; commit `feat:`/`fix:`/`chore:`/`docs:`; push `-u origin`.
- Thin routes, fat services. Scope every query by `store`. Throw `AppError`. Responses `{ success, ... }`.
- Verify before commit: frontend `npm run build`; backend `node -e "require('./src/app.js')"`.
- Keep the vault current in the same session (Work-Log entry + touched domain notes).
- UK tax constants live in `payrollService.js`, mirrored client-side — keep both in sync.

## Open decisions to settle first
1. **PWA vs React Native** for the shell (leaning PWA — no capital, reuses web code).
2. **Freemium line** — what's free vs paid in Phase 1.
3. **The one lead pain** — confirm from real shop conversations (hypothesis: goods-in time + waste). Use [[Customer-Discovery]].

---

**First action in the new tab:** resolve Step 0 (PWA vs RN), then start Step 1.1 (goods-in scan) — it's the daily hook and ~70% already exists.
