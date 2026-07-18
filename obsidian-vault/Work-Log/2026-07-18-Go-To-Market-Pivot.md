# 2026-07-18 — Go-To-Market Pivot: Land with the App, Expand to the Till

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Go-To-Market]] · [[Positioning]] · [[Two-Setups-Till-and-App]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Work through the go-to-market from first principles with the owner and lock a plan that survives the real constraints: no capital, hard to switch shops off old tills, and hardware limits.

## The pivot (owner's decision)
Flip the build order. **App first, till later** — land-and-expand:
- Ship a low-friction **mobile app (inventory + back office)** that runs on the owner's phone *alongside* their existing till → **zero switching cost**.
- Use 0–12 months to build **trust + data + market** and **learn the sharpest common pain** across shops.
- Then launch the **POS/till** as a warm upsell to shops that already depend on us. "The bait is eaten."

Full plan → [[Go-To-Market]].

## Why (strategic reasoning)
- The hardest problem is **inertia** — prying shops off a years-old till. Building the till first fights that wall head-on; the app **walks around it** (nothing to rip out).
- By phase 2 we're the **trusted incumbent** with their data inside → the switch is easy.
- Fits the **no-capital** reality (their phone; buy kit with the shop's upfront money later; Stripe Connect needs no float).
- Most of phase 1 is **already built** — re-surface existing inventory/suppliers/margins/back-office on mobile.

## Key findings from the code audit (device/hardware question)
- Receipt printing = `window.print()` (browser dialog) → runs on **any device with a real browser**; not tied to special hardware.
- `printerService.js`, `hardwareRoutes.js` drawer/printer/terminal endpoints = **stubs** (return success, no USB/serial code anywhere). → Nothing is hard-wired to a device; the device decision is fully open.
- Conclusion: Vendora runs **wherever a browser runs**, NOT on a shop's locked old EPOS box. Same as Square/Shopify. → **iPad-first** for phase 2.

## Decisions locked
- **Order:** App (land) → Till (expand). Reverses the old till-first sequence in [[Two-Setups-Till-and-App]] (scope locks unchanged, only order).
- **Targeting:** broad enough that any small shop can use the app, but sell/learn where the moat lives (indie convenience, off-licence, vape). Do **not** go fully generic (would compete with Sortly/Zoho/QuickBooks with no edge).
- **Device (phase 2):** iPad-first; no-capital kit sales (shop pays upfront setup fee → that money buys their kit; never stock hardware).
- **Till beachhead (phase 2):** broken/dying tills → new openings → shops we know → unhappy shops. Win the easy switches first for reference customers.

## Gotchas
- **The data trap:** sales-driven insights (theft £, real margins, VAT-from-takings, trends) need till data, which phase-1 app won't have. Phase-1 app does inventory / goods-in / waste / suppliers / manual payroll only. → The gap is the **upsell hook**, not a flaw. Promote to [[Conventions]] if it shapes the build.

## Changes (vault only — no code this session)
- `obsidian-vault/Strategy/Go-To-Market.md` — NEW master plan.
- `obsidian-vault/Two-Setups-Till-and-App.md` — sequence reversed + pointer to [[Go-To-Market]].
- `obsidian-vault/Work-Log/Work-Log.md`, `Home.md` — links.

## Commit(s)
- `docs:` go-to-market pivot (hash on push).

## Follow-ups
- [ ] Decide phase-1 app tech: **React Native vs mobile web/PWA** (PWA likely — reuses existing web code, no capital).
- [ ] Decide the **freemium line** (free vs paid).
- [ ] Confirm the **one lead pain** from real shop conversations (hypothesis: goods-in time + waste).
- [ ] (Deferred) Till-foundation fixes — still required before any real Stripe work, now at phase 2.
