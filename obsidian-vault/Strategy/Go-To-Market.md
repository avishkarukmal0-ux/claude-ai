# 🎣 Go-To-Market — Land with the App, Expand to the Till ⭐

Back to [[Home]] · Related: [[Positioning]] · [[Two-Setups-Till-and-App]] · [[Competitor-Teardown]] · [[Feature-Inventory]]

> **Master plan, locked 2026-07-18.** This note supersedes the old "till first" build order. The strategy is now **land-and-expand**: get inside the shop with a low-friction mobile app *alongside* their existing till, earn trust + data + market presence, then launch the POS as a warm upsell once the shop already depends on us.

## The one line
> **Start from the bottom. Find the common ground — what shops are all struggling with. Grow with time until we hold the trust, the data, and the market. Then launch the till.**

The till is no longer the beginning — it's the **payoff** we earn after we're already inside.

## Why this shape (the strategic logic)
The hardest problem in this market is **inertia**: prying a shop off a till they've run for years. Building the till *first* means fighting that wall head-on. This plan **walks around it**:

1. **The app needs no rip-out.** It runs on the owner's own phone, *alongside* the old till → **zero switching cost.** The hardest thing (switching) disappears in phase 1.
2. **By the time we offer the POS, we're the trusted incumbent** — the tool they already use, with their data already inside. The POS becomes an upsell to a warm customer, not a cold rip-out. "The bait is eaten."
3. **It fits the money constraint.** App = their phone, no kit to sell, no capital. See [[Positioning]] "no-capital" model.
4. **Most of it is already built.** Inventory, suppliers, margins, payroll, VAT, the [[Overview-Dashboard]] — phase 1 is largely re-surfacing existing code on mobile, not a new build.

## The two phases

| Phase | Timeline | What ships | Goal |
|---|---|---|---|
| **1 — Land (the App)** | 0–12 mo | Mobile app: **inventory management + goods-in / cash-&-carry scan + expiry/waste + suppliers + owner glance**. Runs on their phone. Freemium, some paid. | **Trust + data + market + discover the sharpest common pain.** |
| **2 — Expand (the Till)** | 12 mo+ | Launch the POS to the shops already hooked. Warm upsell. Carrots: sales-driven insights + cheaper card fees. Till-foundation fixes happen *here*. | Convert the trust into the till + payment margin. |

## The three things we MUST get right
### 1. Broad to learn, focused to keep the edge
Casting wide to *learn* the common pain is fine. But a fully generic "inventory app for everyone" competes with Sortly / Zoho / QuickBooks with **no edge and no money**. Our only moat is **UK retail depth** (payroll, VAT, age/HFSS, shrinkage — see [[Positioning]]). → Build it simple enough that any small shop *can* use it, but **sell + learn where the moat lives**: indie convenience, off-licence, vape.

#### Adjacent beachhead segments (widen the app's reach, ~0 new build)
Off-licence + mini-mart are already covered by the built features. Three adjacencies that **reuse what's built, keep the cash-&-carry goods-in hook, and keep the moat** (age-verification and/or expiry) — widen the discovery net across these:
1. **Newsagents / CTN** (Confectionery–Tobacco–Newsagent) — closest cousin; reuses age-verification (tobacco), barcode, goods-in, margins, PMP, loyalty. Wrinkle: newspaper/magazine sale-or-return (optional).
2. **Independent international / ethnic grocers** (Polish, S-Asian, Halal, Afro-Caribbean, Turkish) — big, underserved; reuses expiry/waste (perishables), suppliers/margins, goods-in, scale (loose goods), alcohol age-verification. Nice-later: multi-language product names.
3. **Vape & CBD shops** — age-verification is central; reuses barcode, wholesaler restock, margins. Watch: some already on Square → target the not-yet-digitised. Minor new: nicotine-strength attribute.

**Second-tier (reuse inventory/margins/goods-in but lose the age/expiry moat):** health-food/whole-food, discount/variety ("pound"), pet shops.

### 2. The data trap — and why it's actually the bait
The best back-office magic — **theft £, real margins, sales trends, VAT from takings** — needs **sales data**, which lives in **the till we're not replacing yet**.
- Phase-1 app **can** do standalone: inventory, goods-in scan, expiry/waste, supplier prices, reorder, manual payroll.
- It **cannot** do sales-driven insights without the till.
- ✅ **Reframe:** that gap *is* the upsell. *"Want your real theft & margin numbers? That comes with the till."* The missing insights become the reason they upgrade in phase 2.

### 3. Stickiness + some early money
An app opened occasionally churns easier than a till used every sale. **The daily hook is the cash-&-carry goods-in scan** — it kills a genuinely hated chore, so they open it on every wholesaler run. Lead with that. Monetise **freemium**, but get *some* shops paying a small amount early so we survive the year without capital.

## Device & hardware model (applies at phase 2)
Vendora runs **wherever a real browser runs** — not on a shop's locked old EPOS box (which has no real browser). That's normal; Square/Shopify replace the old till too.
- **iPad-first.** Cleanest hardware story: everything WiFi/Bluetooth (Star mPOP printer+drawer combo, Stripe Terminal reader). No USB, no drivers.
- Current code fits: receipt printing is `window.print()`; all peripheral endpoints are stubs (nothing hard-wired). See [[2026-07-18-Go-To-Market-Pivot]].
- **No-capital kit sales:** never buy hardware before the shop pays. Shop pays an upfront setup fee → *that money* buys their one kit → we configure + install. We pass hardware through, never stock it.

## Beachhead for the till (phase 2 targeting)
Don't fight happy shops with old tills. Go where the incumbent's grip is weakest, in order:
1. **Old till just broke / dying** — forced choice now; the easiest POS sale there is.
2. **New shop opening** — no incumbent, zero switching cost.
3. **Shops we/family know** — trust already exists.
4. **Shops fighting their provider** on fees/support — already want out.

Win these first → they become the reference customers (*"the shop down the road uses it"*) that crack the stubborn majority.

## What carries over from the old plan
The [[Two-Setups-Till-and-App]] scope locks still hold — only the **order** changed (app first, not till first):
- App does **not** sell; all card payments stay on the counter till (phase 2).
- Cash-&-carry scan = **on-arrival confirm** (builds a goods-in list; stock/cost update on "Received").
- Stock-take → app.
- Payments = **Stripe Connect Express + Terminal reader** — built in phase 2, on an atomic + idempotent sale foundation.

## Open decisions still to make
- Exact **freemium line** for phase 1 (what's free vs paid).
- Whether phase-1 app is **React Native** (native) or a **mobile web/PWA** (cheaper, reuses the existing web code — likely the no-capital choice).
- The **one pain** to lead the app with, confirmed from real shop conversations (hypothesis: goods-in time + waste).
