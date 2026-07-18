# 🧭 The Whole Story — Turning Point · Niches · What We Build ⭐

Back to [[Home]] · Companion to [[App-Kickoff]] · Sources: [[Go-To-Market]] · [[Niche-Pain-Research]] · [[Features-To-Build]] · [[Winning-Strategy]]

> **The full arc on one page.** Everything we decided this stretch, in three parts: (1) the **turning point** — why we changed direction, (2) our **niches** — who we're for and in what order, (3) **what we're going to build**. Take this into the fresh tab alongside [[App-Kickoff]].

---

## Part 1 — The Turning Point 🔄

### The old plan
Build the **till (POS) first**, sell it to shops, replace their old system.

### The wall we hit
The hardest thing in this market is **inertia** — prying a shop off a till they've run for years. Building the till first means fighting that wall head-on. And we have **no capital** to fund hardware or a long fight.

### The new plan — land, then expand 🎣
> **Start from the bottom. Ship a low-friction phone app that runs *alongside* their old till (zero switching cost). Kill one hated chore so they open it daily. Earn trust + data + market. Then launch the till as a warm upsell — the bait already eaten.**

Two phases:
| Phase | When | Ships | Goal |
|---|---|---|---|
| **1 — Land (App)** | 0–12 mo | Inventory + goods-in scan + waste + suppliers + owner glance + MTD books, on their phone | Trust + data + market + find the sharpest pain |
| **2 — Expand (Till)** | 12 mo+ | The POS, to shops already hooked. Carrots: real sales insights + cheaper card fees | Convert trust into the till + payment margin |

### Why this walks around the wall
1. **No rip-out** — app runs on their phone next to the old till → switching cost ≈ 0.
2. **We become the trusted incumbent** before we ever ask them to change the till.
3. **Fits the money constraint** — their phone, no kit, no capital.
4. **Most of it is already built** — Phase 1 is largely re-surfacing existing code on mobile.

### The one discipline that came out of it
**Learn BROAD, build/sell FOCUSED.** Talk to many shop types (free conversations) so we know exactly what the POS must cover — but build deep for one segment at a time. And **burden-first, not feature-first**: AI made features cheap, so we win on **Accuracy** (kill the *right* burden completely) + **Trust** (safe with their money). See [[Winning-Strategy]].

---

## Part 2 — Our Niches 🎯

### Already covered by what's built
- **Off-licences** and **mini-marts / convenience** — the starting ground.

### Adjacent beachheads (widen reach, ~0 new build — reuse age-verification / expiry / goods-in)
1. **Newsagents / CTN** (Confectionery–Tobacco–Newsagent) — closest cousin; reuses age-verification, barcode, goods-in, margins, PMP, loyalty.
2. **International / ethnic grocers** (Polish, S-Asian, Halal, Afro-Caribbean, Turkish) — big, underserved; reuses expiry/waste, suppliers, loose-goods scale, alcohol age-check.
3. **Vape & CBD shops** — age-verification central; reuses barcode, wholesaler restock, margins. Target the not-yet-digitised.

**Second tier** (reuse inventory/margins/goods-in, lose the age/expiry moat): health-food, discount/pound, pet shops.

### The full niche map we researched (for the eventual POS — [[Niche-Pain-Research]])
Off-licence · convenience · newsagent/CTN · ethnic grocer · greengrocer · butcher/fishmonger · bakery/deli/farm shop · vape/CBD · health-food · discount/pound · pet shop · market traders.

### What ALL of them share (the universal wedges — build these into the core)
| Burden | Why it bites |
|---|---|
| **MTD for Income Tax** (Apr 2026) | Legally forced quarterly digital filing — universal, urgent, unavoidable. **The top new wedge.** |
| **Perishable waste** | "Half my fresh ends in the bin" — biggest untooled cash leak. |
| **Cash-&-carry / goods-in faff** | Weekly hated chore — the **daily hook**. |
| **Age-verification / compliance** | Off-licence, tobacco, vape — legal risk, our moat. |
| **Margin blindness + card fees** | Don't know true margin; card fees hurt (the Phase-2 upsell). |

---

## Part 3 — What We're Going to Build 🧱
(Full detail + 🆕 new vs ♻️ reuse tags in [[Features-To-Build]]. Build order + code paths in [[App-Kickoff]].)

### Phase 1 — Common Core (build once, every shop gets it)
1. **Goods-in scan → on-arrival confirm** — the daily hook (~70% exists).
2. **MTD for Income Tax export** — auto-capture sales + expenses → quarterly figures.
3. **Demand forecasting** — cut over/under-ordering.
4. **Dynamic markdown suggestions** — on top of existing expiry rules.
5. **Migration/onboarding import** — pull data from old EPOS/spreadsheet (kills the switching barrier).

### Phase 1 — App faces (mostly re-surfacing built code)
Owner pocket view · worker view · suggest-to-owner loop · mobile goods-in scan · mobile stock-take.

### The architecture that makes it scale — ONE app, per-shopType interface
- A **`shopType` dial** on top of the existing `PLAN_FEATURES` flags → shown = **Core + (plan allows) + (shopType needs)**.
- A **module registry** (config, not `if`-spaghetti); smart default at signup + owner toggle for hybrids.
- Never fork the app per vertical. This is *how* we cover many niches without building everything at once.

### Vertical modules — bolt on ONE at a time, only when field data justifies
Off-licence (MUP pricing, duty) · convenience (FEFO waste, delivery-app orders) · newsagent (sale-or-return, HND rounds, track-&-trace) · ethnic grocer (cultural-calendar demand, halal traceability) · greengrocer/butcher/bakery (scale, yield/QUID, PPDS labels) · vape (compliance-by-design, VPD duty) · etc. **Do not build these speculatively.**

### Phase 2 — the payoff
Till-foundation fixes (atomic + idempotent sales, the known bugs) → **Stripe Connect Express + Terminal** for the payment margin. The real sales insights (theft £, true margin) unlock here — the reason they upgrade.

---

## The one-sentence version
> We stopped trying to replace the till first. Instead we land with a **free-to-cheap phone app** that kills the goods-in chore and handles their **MTD books**, spreading across **off-licence → newsagent → ethnic grocer → vape** and beyond, on **one core + per-shopType modules** — then, once they trust us and their data lives with us, we launch the **till + payment margin** as a warm upsell.

**Next:** open the fresh tab, read [[App-Kickoff]], resolve PWA-vs-React-Native, and start the goods-in scan.
