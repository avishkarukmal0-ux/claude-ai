# 2026-09-30 — Niche reassessment & pivot to validation

Back to [[Work-Log]] · Related: [[Market-Research-2026-09]] · pilot kit: `vendora-pos/pilot/`

## Goal
Founder doubted the market ("no market for our niches?") after seeing few shops on Google. Reassess
before sinking Phase-2 backend work into the wrong market.

## What happened (no product code this session)
- Corrected a measurement error: Google Maps counts ≠ shop counts.
- Ran a decision-grade market-research pass (see [[Market-Research-2026-09]]). Net: market is large &
  reachable; B2B2C real but slow; **willingness-to-pay unproven** by published data.
- Founder revealed strong **founder-market-fit**: worked in off-licences/convenience, confident owners
  pay, has warm + cold access. Picked the three pains to lead with: **supplier credit, waste, over-ordering.**
- **Decision: keep the niche, stop building, run a direct paid pilot to prove willingness-to-pay.**

## Shipped (go-to-market kit, not code) — `vendora-pos/pilot/`
- `PITCH-ONE-PAGER.md` — owner-facing "3 leaks" pitch + free-month / £25 offer + money-back framing.
- `INTERVIEW-SCRIPT.md` — 15-min conversation to confirm pain, capture baseline £, ask for the pilot & payment.
- `PILOT-PLAN.md` — 4-week paid-pilot playbook; success bar = ≥3/5 pay £25/mo and money-found ≫ £25.
- `PILOT-TRACKER.md` — the willingness-to-pay evidence table (baseline → result → paid?).

## Product implication
No new features needed for the pilot — the three leaks are already built (delivery+claims, expiry/waste,
buy-list/slow-stock), and Monthly Outcomes is the pilot scoreboard. Phase 2 (accounts/sync) is PAUSED
until shops are paying.

## Cross-check with a second assessment ([[Niche-Market-Assessment-2026-09]])
An independent decision-research doc was reviewed in parallel. Agrees on direction; fills the
competition gap my run left. **Material correction: the supplier-credit/discrepancy wedge already has
direct competitors (sruu, growyze, Stockagile, ShopMate, supplier apps)** — so differentiate on
cross-supplier follow-up reliability vs the owner's current tool, not on novelty. Also: narrow the
customer (owner-operated, 1–3 sites, several suppliers, existing till), add international grocers, and
require value ≥3× fee. Folded these into the pilot kit:
- One-pager: reframed leak 1 to the cross-supplier "nothing falls through the cracks" gap; "works
  alongside whatever you already use."
- Interview script: added the key step — **make the owner demo their current tool; only continue if a
  real gap remains** — plus competitor context.
- Tracker: added current-tool/EPOS + gap columns and the 3× value gate.
- Plan: sharper ICP, added international grocers, competitor-scan in Week 0, 3× success gate.

## Follow-ups
- Founder to run Week-0 conversations (target 3 booked pilots from ~6 chats), **demoing each shop's current tool first**.
- Optional: polish the one-pager into a shareable/printable page; add a landing page for cold walk-ins.
- On proof → resume [[2026-09-30-IndexedDB-Durability|infra]] Phase 2 + open B2B2C with paying-shop proof.

## Commit
`docs: niche reassessment, market research + paid-pilot kit (validation over building)`
