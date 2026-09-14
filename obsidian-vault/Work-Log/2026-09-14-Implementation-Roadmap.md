# 2026-09-14 — Implementation Roadmap (Phase 1 execution plan)

Back to [[Work-Log]] · Related: [[Implementation-Roadmap]] · [[The-Whole-Story]] · [[App-Kickoff]]

## Goal
User wants to stop planning and start building ASAP. Turn the locked strategy into a concrete, sprint-by-sprint execution plan with locked decisions so nothing stalls.

## What changed (files)
- **Created** `Strategy/Implementation-Roadmap.md` — milestones M0–M5 (+ Phase 2), each with a "done when" acceptance test; locked the 4 open decisions (PWA shell, lead pain = goods-in + MTD, freemium line, first vertical = off-licence).
- **Edited** `Home.md` — linked Implementation-Roadmap at top of Strategy.
- **Edited** `Work-Log/Work-Log.md` — indexed this entry.

## Decisions (locked, user can veto)
1. **Shell = PWA** (installable mobile web) — reuses frontend, no capital.
2. **Lead pain = goods-in scan + MTD** — daily hook + forced universal obligation.
3. **Freemium:** free = inventory + goods-in + expiry alerts; paid ~£29/mo = MTD export + forecasting + owner reports + multi-user.
4. **First vertical = off-licence** (built) → newsagent next.

## Milestone shape
M0 Foundations (PWA shell) → M1 goods-in scan (the hook) → M2 MTD + owner glance → M3 shopType architecture + app faces → M4 forecasting/markdown/migration → M5 first vertical + field validation in 1–3 real shops. Phase 2 (till fixes + Stripe margin) deferred until shops are hooked.

## Follow-ups
- User to confirm/veto the 4 locked decisions.
- User to name 1–2 reachable shops for M5 field validation.
- Build work happens in the fresh tab: read [[App-Kickoff]], start M0.

## Commit
- (this session — docs)
