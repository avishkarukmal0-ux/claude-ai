# Vendora — 4-week paid-pilot playbook

**The one goal:** prove that real shop owners will **pay** for Vendora — before we build anything else.
Everything below serves that. We are not testing features (they work); we are testing willingness to pay.

**Why now:** market research confirmed the market is large (~50k UK convenience stores, ~33–38k
unaffiliated independents) and reachable, BUT could not prove owners pay for non-till software, and
showed the wholesaler (B2B2C) channel converts slowly (Booker's free Scoot app: ~4% uptake in year 1).
So the fastest way to de-risk is a small **direct** paid pilot using our founder's own shop access.
Full context: `obsidian-vault/Market-Research-2026-09.md`.

---

## The offer to each shop
- **First month free**, set up together, aimed at the 3 leaks (supplier credit, waste, over-ordering).
- Then **£25/month, cancel anytime.** Guarantee: *"if it doesn't find you more than it costs, don't pay."*
- Founding-shop framing: they're first, they shape it, price is locked for them.

## Who (target 5–6 shops)
Use your access in this order: **owners you know well → a couple you can ask → local walk-ins.**
Mix of **convenience + off-licence** (your two confident niches), and add **1–2 international grocers**
(fragmented multi-supplier buying + case/unit conversion is a strong gap, reachable via local clusters).

**Sharper customer profile (qualify for this, don't just take any shop):** an **owner-operated**
food/drink shop with **1–3 locations, several suppliers, an existing till, and a recurring
delivery/invoice/credit problem their current tools don't handle conveniently.** The owner must
**personally** check supplier bills and be accountable for the result — staff can capture evidence but
usually aren't the buyer. Skip symbol-managed head-office shops (they can't say yes on their own).

---

## Week 0 — line them up (this week)
- Have the 15-min conversation (see `INTERVIEW-SCRIPT.md`). Log every one in `PILOT-TRACKER.md`.
- **Make each owner demonstrate the tool they use for this today** (EPOS / supplier app / notebook /
  nothing) and record the gap it leaves. Only pursue shops where a real gap remains after that demo.
- Book setup with everyone who gives a **real** "I'd pay" AND has a genuine gap their current tool misses.
- Target: **3 booked pilots** out of ~6 conversations.

## Week 1 — set up (10–15 min per shop, in person)
- Pick shop type, add their **top ~30–50 lines** (or import a list). Don't boil the ocean.
- Turn on the 3 leaks: delivery receiving + claims, expiry/waste, buy-list/slow-stock.
- Write down their **baseline** on the tracker (from the interview) — this is what you'll prove against.
- Show them the **"This month"** page — that's their scoreboard.

## Weeks 2–4 — use it for real
- Owner/staff check **every delivery** on the phone and flag issues → raise claims.
- Log **waste** as it's binned; follow the sell-first prompts.
- Use the **buy list** before the cash-and-carry run.
- Light-touch check-in ~twice a week (WhatsApp): "any deliveries short this week? claim raised?"

## End of Week 4 — the moment of truth
- Sit with the owner and open **"This month"**: £ credit recovered, £ waste (and trend), stock checked.
- Compare to their baseline. Say the number out loud: *"It's found/saved you £___ this month."*
- **Ask for the card:** "Keep it for £25/month?" — this yes/no is the whole experiment.
- If no: "What would make it a yes?" Record the exact words.

---

## What "success" looks like (decide the pivot on this, not vibes)
- **≥3 of 5 pilots convert to paying** at £25/mo, **and**
- median money-found per shop is **≥ 3× the fee** after allowing for the owner's extra effort (so the
  value is obvious, not marginal), **and**
- the value comes from a **gap their existing tool didn't already cover** (not something Square/ShopMate/
  a supplier app does for free) — otherwise they'll churn back to what they had.

> Reality check from independent research: invoice-checking, discrepancy detection and supplier-credit
> tracking are **already existing software categories** (sruu, growyze, Stockagile, ShopMate, supplier
> apps). Vendora's only defensible wedge is doing the **cross-supplier follow-up until credit lands**
> more reliably, with less duplicate entry, than the owner's current setup. Prove that, not novelty.

**If yes →** willingness-to-pay is proven. *Then* resume Phase 2 (accounts/sync) and open the B2B2C
channel to scale — knowing it's a slow burn, with paying-shop proof to show a wholesaler.

**If no →** we do NOT keep building for this customer. We pivot: sell to the wholesaler as the payer,
or move to an adjacent vertical — armed with the exact objections from the "what would make it a yes"
answers.

---

## Practical notes
- **Data is per-shop and on-device today** (localStorage + IndexedDB durability). Fine for a pilot.
  Multi-device/accounts is Phase 2 — only build it once shops are paying.
- **Pricing** (£25) is a starting point; earlier pricing research put viable tiers around £29/59/99,
  so £25 founding is deliberately easy to say yes to. Adjust per what owners tell you.
- Keep it **honest**: the app never invents savings — the "This month" figures are real actuals, with
  estimates shown separately. That honesty is your credibility in the room.
