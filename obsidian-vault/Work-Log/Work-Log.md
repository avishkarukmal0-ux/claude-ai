# 📓 Work Log

Back to [[Home]]

Running journal of **everything we do from here onwards** — newest first. Each entry is its own note (date-prefixed) so they sort and link cleanly. Use [[_Template]] to start a new one.

## Entries
- [[2026-07-16-Two-Setups-Scope-Lock]] — locked what goes in the **Till (web) vs App (mobile)**; full code audit; built [[Feature-Inventory]] + [[Two-Setups-Till-and-App]]
- [[2026-07-16-Per-Product-Margins]] — margins now resolve **per-product → category → store default**; new Per-Product Margins table (set % + "Set & reprice")
- [[2026-07-16-Nightly-WhatsApp-Summary]] — the recap now **auto-sends on WhatsApp at closing time** (Notification outbox + every-minute cron + Twilio, env-gated; Phase 3b)
- [[2026-07-16-Daily-Summary]] — end-of-day "shop closed fine" recap owners can **one-tap share to their phone** (`GET /overview/daily-summary`, Phase 3)
- [[2026-07-16-Owner-Home]] — dashboard is now the owner's **landing screen**: shop-status banner, "Today so far" strip, quick actions ("everything at your fingertip", Phase 1)
- [[2026-07-15-Wire-POS-Refund-Button]] — the `↩ Refund` button in the till now opens a working refund modal (was a dead stub)
- [[2026-07-15-Atlas-Connection-Setup]] — launcher now opens a step-by-step Atlas guide (`GET-DATABASE-LINK.txt`) to grab `MONGODB_URI` for real local data
- [[2026-07-13-Login-Store-Picker]] — login now has a store dropdown (GET /auth/stores) instead of pasting a Mongo ID
- [[2026-07-13-Build-Overview-Dashboard]] — built the flagship "This Week" owner dashboard (theft £ + waste £ + margin), real data
- [[2026-07-13-Positioning-Pivot-Theft-Wedge]] — owner feedback: lead with theft/waste, not wages; theft = £6k/store/yr pain
- [[2026-07-13-Positioning-Research]] — market research; defined positioning vs Square/Shopify/Epos Now & AI clones
- [[2026-07-13-Fix-Payroll-Route-Mount]] — removed a stub `/payroll` mount that crashed boot; added `CLAUDE.md` for auto-updating the vault
- [[2026-07-13-Recovery-and-Setup]] — laptop lost, project recovered from GitHub; Obsidian vault created

## How to use
- Start every working session by adding a new dated entry (copy [[_Template]]).
- Log: what we set out to do, what changed (files), decisions, gotchas, commit hash, follow-ups.
- Link entries to the [[Domains-Index]] note(s) they touch so the graph stays connected.
- Cross-link gotchas into [[Conventions]] so they're not lost.

## Standing backlog / ideas
> Move items into a dated entry when we pick them up.

- [x] ~~Tidy `routes/index.js` payroll mount~~ — done in [[2026-07-13-Fix-Payroll-Route-Mount]] (was a boot-crash bug; removed dead stub)
- [ ] End-to-end manual test of Accounting flow (VAT → Payroll → Expenses → P&L)
- [ ] Confirm Railway + Vercel deploy configs current
