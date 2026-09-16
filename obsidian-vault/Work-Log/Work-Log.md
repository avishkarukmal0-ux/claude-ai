# 📓 Work Log

Back to [[Home]]

Running journal of **everything we do from here onwards** — newest first. Each entry is its own note (date-prefixed) so they sort and link cleanly. Use [[_Template]] to start a new one.

## Entries
- [[2026-09-16-Niche-Gap-Analysis]] — 4 parallel research agents (one per family) → **ranked per-niche gaps** + the surgical build set (expiry/FEFO · MUP+VPD · PPDS labels · loose price/kg · cash-up buckets) → [[Niche-Gap-Analysis]]
- [[2026-09-16-Backup-Restore]] — **export / restore backup** (all local data → one JSON file, share or download; restore replaces + reloads) — peace of mind before the backend; verified round-trip
- [[2026-09-16-Takings-And-Owner-Glance]] — **day-takings + cash-up** (variance) and **Owner glance goes live** with real takings/waste/stock numbers — no till, no backend; verified
- [[2026-09-16-Share-Buy-List]] — per-supplier **Share** (Web Share → WhatsApp/text, clipboard fallback) so shops order via any channel — Vendora is the brain across all suppliers, not a competitor to their apps; + Stock→Suppliers shortcut
- [[2026-09-16-Suppliers]] — **Suppliers** (niche-aware buying places) wired through inventory → the buy list is now **grouped by where you shop**; verified end-to-end
- [[2026-09-16-Reorder-Buy-List]] — **reorder suggestions**: low stock → a tickable **cash-&-carry buy list** (suggested qty, mark bought, feeds goods-in); local-first & persistent; verified
- [[2026-09-16-ADR-Shared-Backend]] — locked the architecture decision: **one shared v3 backend/DB for App + Till** (not separate); reasoning + mitigations in [[ADR-001-Shared-Backend]]
- [[2026-09-15-Connect-Backend-MongoDB]] — backend is **ready to connect**: `/health` now reports **db status**; wrote the [[Connect-Backend-MongoDB]] runbook (Atlas → Railway → Vercel). Going live is now a config/deploy task (founder's URI + hosting)
- [[2026-09-14-Waste-Tracker]] — **waste & savings tracker**: log binned vs rescued → £ wasted / £ saved this month, "you rescued £X" banner; local-first & persistent; opens from the Expiry & waste tile
- [[2026-09-14-Goods-In-And-Inventory]] — **M1: the first pay-worthy workhorse** — goods-in scan (native BarcodeDetector + manual) → **live inventory** (search, low-stock, margins, qty steppers), **local-first & persistent**; verified scan→receive→stock→reload → [[Implementation-Roadmap]]
- [[2026-09-14-Today-And-Compliance-Radar]] — **"Today at the shop"** morning glance + UK **Compliance Radar**, both **tailored per shop family** (verified across off-licence/butcher/world/market); fixed a modal-overflow bug
- [[2026-09-14-Quick-Tools]] — added glance-and-go **helper tools** (no POS, no backend): MTD countdown · margin calculator · age-check helper; per-shop-type gated; verified end-to-end
- [[2026-09-14-Mobile-App-Home]] — **M0 complete**: pick → Continue → a mobile **app-home** tailored to the shop type (module catalog: core + family extras) + bottom-nav shell; verified end-to-end → [[Implementation-Roadmap]]
- [[2026-09-14-Picker-Value-Promises]] — front door now sells + works: per-family **burden-first value promises**, a trust strap-line, and a **"Log in"** link for returning shops
- [[2026-09-14-Recategorise-Niches-4-Families]] — grouped the ~12 shop types into **4 families by shared module bundle** (Grocery & age-restricted · Fresh & weighed · World & specialist · Mobile & value); picker now shows 4 tiles + optional sub-type → build 4 bundles not 12
- [[2026-09-14-Niche-Picker-Front-Door]] — replaced login as the entry with a **9-niche shop-type picker** (`shopTypes.js` registry + `NichePickerPage`); seeds the M3 `shopType` dial; verified in headless Chromium → [[Implementation-Roadmap]]
- [[2026-09-14-M0-PWA-Foundation]] — **first real build of Phase 1**: made the frontend an installable **PWA** (manifest + service worker + icons, no new deps); build + served-artifact verified → [[Implementation-Roadmap]] M0
- [[2026-09-14-Implementation-Roadmap]] — turned the locked strategy into a **sprint-by-sprint build plan** (M0–M5 + Phase 2), each with a "done when" test; locked 4 decisions (PWA shell, lead pain = goods-in + MTD, freemium line, first vertical = off-licence) → [[Implementation-Roadmap]]
- [[2026-07-18-Niche-Pain-Research]] — desk research across ~12 Phase-1 niches; **new top wedge: MTD for Income Tax (Apr 2026)**; perishable waste = biggest untooled leak; vape compliance-by-design; market-trader phone-first thesis validated → [[Niche-Pain-Research]]
- [[2026-07-18-Go-To-Market-Pivot]] — **strategy pivot**: ship the **App first** (land — inventory/back-office on their phone, zero switching cost), earn trust+data+market, **then launch the Till** (expand). Reverses the till-first order. iPad-first; no-capital.
- [[2026-07-16-Pricing-and-Margin-Validation]] — validated **£29/59/99 tiers** (keep) + computed the **payment margin**: works only on Stripe **Interchange++** (break-even basket ~£4 vs ~£100 on standard); +£77/store/mo at base case
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
