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

### M0 — Foundations *(week 1)* — 🟡 in progress
Make the existing code phone-ready and safe to build on.
- ✅ PWA shell: manifest + service worker on the existing frontend; installable "Add to Home Screen". *(done 2026-09-14 — [[2026-09-14-M0-PWA-Foundation]]; build + served-artifact verified.)*
- ⬜ Mobile-first shell/nav for the app views (owner vs worker).
- ⬜ Auth + store-scoping confirmed on mobile (login store-picker already exists).
- **Done when:** you can install Vendora on a phone, log in, pick a store, see an (empty) mobile home.

### M1 — The daily hook: goods-in scan *(weeks 2–3)* ⭐
The single most important build. ~70% exists (invoiceReader template).
- Camera/barcode scan → goods-in session (add lines as you scan the trolley).
- Unknown barcode → quick-create product inline.
- "Received" → one `stockMovementService.receive()` that **increments stock + updates cost** (kill the inline `$inc` copies).
- **Done when:** a shopkeeper scans a cash-&-carry trolley on their phone and stock + costs are correct after "Received."

### M2 — MTD core + owner glance *(weeks 4–5)*
The universal wedge + the reason the owner opens it daily.
- Auto-capture sales + expenses → **MTD-ready quarterly figures** export (start with a clean CSV/summary; API submission later).
- Owner pocket view: reuse [[Overview-Dashboard]] (takings, waste £, margin, cash) + nightly "shop closed fine".
- **Done when:** an owner sees this-quarter's MTD figures and today's glance on their phone.

### M3 — shopType architecture + app faces *(weeks 6–7)*
The dial that lets one app serve every inch.
- ✅ *Head start:* front-end **shop-type registry** (`frontend/src/config/shopTypes.js`) + the 9-niche **picker** now the app's front door *(2026-09-14 — [[2026-09-14-Niche-Picker-Front-Door]])*. Config-driven, no `if`-spaghetti.
- ⬜ `shopType` field on the store; extend `PLAN_FEATURES` (`backend/src/models/Subscription.js`) → shown = Core + (plan) + (shopType).
- ⬜ Module **registry** wiring modules → shopType; default at signup + owner toggle.
- Worker view (expiring-soon + trends; wire MarketIntel's dead buttons) + suggest-to-owner loop.
- **Done when:** switching a store's `shopType` changes its visible modules with no code change.

### M4 — Forecasting, markdown, migration *(weeks 8–10)*
Complete the Core's money-savers + the switching wedge.
- Demand forecasting (forecast-to-order).
- Dynamic markdown *suggestions* on top of expiry rules.
- Migration/onboarding import (old EPOS/spreadsheet → products/prices in minutes).
- **Done when:** a new shop is imported in minutes and gets reorder + markdown suggestions.

### M5 — First vertical + FIELD VALIDATION *(weeks 11–12)*
Prove it in a real shop before widening.
- Off-licence module polished (MUP, duty) via the dial.
- **Get it into 1–3 real shops.** Use [[Customer-Discovery]]: confirm the lead pain, the freemium line, and that goods-in + MTD are the hooks.
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
