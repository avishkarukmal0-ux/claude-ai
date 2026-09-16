# 🗓️ Implementation Roadmap — Phase 1 App, sprint by sprint ⭐

Back to [[Home]] · Reads with [[The-Whole-Story]] · [[App-Kickoff]] · [[Features-To-Build]] · [[Winning-Strategy]]

> **The execution plan (2026-09-14).** Strategy is done — this is *what we build, in what order, and how we know each piece is finished.* Milestones are small on purpose so a real shop can use something early. Decisions that were "open" are **locked below with recommendations** so nothing stalls; override any of them by saying so.

---

## 🔒 Decisions locked (veto any of these)
| Decision | Locked choice | Why |
|---|---|---|
| **App shell** | **PWA** (installable mobile web) | Reuses the existing React frontend, runs on any phone, **zero capital**, no app-store gatekeeping. React Native only if a hard native need appears. |
| **Lead pain** | **Goods-in scan + MTD** | Goods-in = the daily hook (opened every wholesaler run). MTD = universal + legally forced. One habit, one obligation. |
| **Freemium line** | **Free:** inventory + goods-in scan + expiry/waste alerts (the hook). **Paid (~£29/mo):** MTD export, forecasting, owner reports, multi-user. | Give away the daily habit; charge for the money/time/compliance wins. |
| **First vertical** | **Off-licence** (already built) → **newsagent** next | Moat features exist; near-zero new build; proves the shopType dial. |

---

## The milestones (each ships something usable)

### M0 — Foundations *(week 1)* — ✅ done 2026-09-14
Make the existing code phone-ready and safe to build on.
- ✅ PWA shell: manifest + service worker; installable "Add to Home Screen". *([[2026-09-14-M0-PWA-Foundation]])*
- ✅ Front door = 4-family shop-type picker (login no longer forced) *([[2026-09-14-Niche-Picker-Front-Door]], [[2026-09-14-Recategorise-Niches-4-Families]])* + sells (promises/trust/log-in) *([[2026-09-14-Picker-Value-Promises]])*.
- ✅ Mobile-first shell/nav + app-home: pick → **Continue** → `/home` with a tailored module grid (shopType dial visible) and a bottom-nav shell *([[2026-09-14-Mobile-App-Home]])*.
- **Done:** install on a phone → pick a shop type → land on a mobile home tailored to it. *(Live sales/numbers await the backend connection — see below.)*
- ⏳ **Deferred to backend wiring:** real login/store-scoping on mobile + live data (needs MongoDB Atlas URI + always-on backend).

### M1 — The daily hook: goods-in scan *(weeks 2–3)* ⭐ — 🟢 working (local-first) 2026-09-14
The single most important build — the first genuinely pay-worthy feature.
- ✅ Camera/barcode scan (native `BarcodeDetector`) → goods-in session; manual entry fallback everywhere. *([[2026-09-14-Goods-In-And-Inventory]])*
- ✅ Unknown barcode → quick-create inline; known barcode → prefills name/cost.
- ✅ "Receive" → **increments stock + updates cost**; live **Inventory** view (search, low-stock, margins, qty steppers).
- ✅ **Local-first** (`inventoryStore.js` over localStorage) — real & offline today; **survives reload**. Verified end-to-end in headless Chromium.
- ⏳ **Backend leg (deferred):** sync stock across devices + the server-side `stockMovementService.receive()` — needs the DB connected.
- **Done (local):** scan/type a trolley on the phone → stock + costs correct after Receive, persisted.

### M2 — MTD core + owner glance *(weeks 4–5)* — 🟡 partial
The universal wedge + the reason the owner opens it daily.
- ✅ Owner pocket view — live **Owner glance** (takings, waste £, products, low-stock), local-first *([[2026-09-14-Takings-And-Owner-Glance]])*.
- ✅ MTD **countdown** quick tool + **compliance radar**.
- ⬜ Auto-capture sales + expenses → **MTD-ready quarterly figures** export — *needs sales data + backend; deferred.*
- ⏳ Nightly "shop closed fine" — exists on the till backend; not yet on the app.

### M3 — shopType architecture + app faces *(weeks 6–7)* — ✅ done (front-end)
The dial that lets one app serve every inch.
- ✅ Front-end **shop-type registry** (4 families + members) + **module catalog** (Core + per-family modules) + picker front door.
- ✅ Per-shopType interface working (each family sees its own tools + quick tools).
- ✅ **Worker "Staff view"** (expiring + low-stock, one-tap flags) + **suggest-to-owner loop** (owner "From the team" inbox with badge) *(2026-09-16)*.
- ⏳ Backend `shopType`/`PLAN_FEATURES` wiring — deferred to backend (front-end dial is complete).

### M4 — Forecasting, markdown, migration *(weeks 8–10)* — 🟡 mostly done
Complete the Core's money-savers + the switching wedge.
- ✅ **Reorder suggestions** (lite forecast: low-stock → buy list) *([[2026-09-16-Reorder-Buy-List]])*.
- ✅ **Dynamic markdown / FEFO** — expiry "sell first" list *([[2026-09-16-Gap-Fills-1-4]])*.
- ✅ **Migration/onboarding CSV import** (old EPOS/spreadsheet → products in minutes) — the switching wedge *(2026-09-16)*.
- ⬜ **Demand forecasting** (proper forecast-to-order) — not built; **needs real sales history → after the backend**.

### M5 — First vertical + FIELD VALIDATION *(weeks 11–12)* — ❌ not started
Prove it in a real shop before widening.
- ✅ Off-licence essentials via the dial (MUP tool, age-check, compliance).
- ⬜ **Get it into 1–3 real shops** — *the key remaining step; needs a shop.*
- **Done when:** a real shop uses the app on its own wholesaler run and you have their feedback.

### Phase 2 (later, only once shops are hooked)
Till-foundation fixes (atomic + idempotent sales, the known bugs) → **Stripe Connect Express + Terminal** for the payment margin. Not now.

---

## What I need from you to keep moving
1. **Confirm or veto the 4 locked decisions above** (silence = I proceed as locked).
2. **One or two shops you can actually reach** for M5 field validation (family/known shops count).
3. Say **"start M0"** in the fresh build tab and I'll begin the PWA shell.

## Guardrails (unchanged)
- Every feature passes the **Accuracy Filter** ([[Winning-Strategy]]): names its burden + hours saved + £ protected, or it's cut.
- Build the **Core once**; verticals are config + modules, never forks.
- Verify before commit (frontend `npm run build`; backend boot check); keep the vault current each session.

**Immediate next action:** open the build tab → read [[App-Kickoff]] → **start M0 (PWA shell).**
