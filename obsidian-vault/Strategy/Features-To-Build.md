# 🧱 Features To Build — the ADD list

Back to [[Home]] · Related: [[Go-To-Market]] · [[Niche-Pain-Research]] · [[Feature-Inventory]] · [[Two-Setups-Till-and-App]]

> **What we're going to ADD.** Distinct from [[Feature-Inventory]] (everything *already built*). Tags: 🆕 build from scratch · ♻️ extend/wire something partly there. Ordered by build sequence from [[Go-To-Market]]. **Don't build it all** — build the Core + first vertical, bolt on the rest as [[Customer-Discovery]] justifies.

## Build order at a glance
1. **P1 Core** — the shared engine every shop gets
2. **P1 App** — the phone app that lands us in the shop
3. **Architecture** — the shopType dial that powers per-shop interfaces
4. **Vertical Modules** — bolt-ons, one at a time, chosen by field data
5. **P2 Till foundation** — the fixes before real money
6. **P2 Payments** — Stripe Connect + Terminal (the margin engine)

---

## A. Common Core — build once, every shop (Phase 1)
- 🆕 **MTD for Income Tax export** — auto-capture every sale + expense → MTD-ready quarterly figures. *(New top wedge — live Apr 2026, legally forced, universal.)*
- ♻️ **Cash-&-carry / goods-in scan → on-arrival confirm** — goods-in session that *increments* stock + updates cost on "Received"; unknown-barcode quick-create; one `stockMovementService.receive()` (stop the inline `$inc` copies). *(~70% exists as template — invoiceReader block.)*
- ♻️ **Sales-velocity suggested reordering** — real engine behind the `smartReorder` flag.
- ♻️ **Dynamic / data-driven markdown** — markdown *suggestions* on top of the existing expiry rules (only ~5% of UK markdowns are data-driven — the gap).
- 🆕 **Demand forecasting (forecast-to-order)** — cut over/under-ordering; biggest ROI across fresh niches.
- ♻️ **Invoice ↔ delivery reconciliation** — check delivery vs invoice, flag shorts/credits.
- 🆕 **Migration / onboarding import** — pull products/prices from old EPOS/spreadsheet in minutes. *(The switching wedge — kills the #1 barrier.)*

## B. Phase-1 Mobile App (all 🆕 — the whole app is new)
- 🆕 **App scaffold** — PWA first (reuses existing web code, no capital) vs React Native *(decision pending)*.
- ♻️ **Owner pocket view** — reuse [[Overview-Dashboard]] (takings, theft £, waste £, margin, cash) + nightly "shop closed fine".
- ♻️ **Worker view** — expiring-soon + trends; **wire MarketIntel's dead action buttons** properly.
- 🆕 **Suggest-to-owner loop** — worker flags "stock this" / "mark down" → owner inbox.
- ♻️ **Mobile cash-&-carry goods-in scan** — the App face of the Core goods-in flow.
- ♻️ **Mobile stock-take** — reuse `StockTake` service, new mobile UI.

## C. Architecture (Phase 1, enables everything after)
- ♻️ **`shopType` dial on the store** — extend the existing `PLAN_FEATURES` flag system: shown features = Core + (plan allows) + (shopType needs).
- 🆕 **Module registry** — config maps shopType → modules (no `if (shopType===…)` spaghetti); default from type at signup, owner can toggle (hybrids).

## D. Vertical Modules — bolt-ons, one at a time (evidence from [[Niche-Pain-Research]])
- **Off-licence** — 🆕 MUP formula pricing (65p × ABV × litres) + enforcement; ♻️ strength-based duty repricing; 🆕 DRS deposit handling *(2027)*.
- **Convenience** — ♻️ FEFO date-code waste + cold-chain markdowns; 🆕 delivery-app (Uber/Deliveroo) order aggregation.
- **Newsagent / CTN** — 🆕 magazine sale-or-return reconciliation; 🆕 HND round scheduling/billing; 🆕 tobacco track-&-trace scan capture.
- **Ethnic / int'l grocer** — 🆕 cultural-calendar demand forecasting (Eid/Diwali); ♻️ multi-cash-&-carry ordering; 🆕 halal traceability.
- **Greengrocer** — 🆕 cost-linked daily repricing; 🆕 loose-weight scale↔EPOS; ♻️ dynamic markdown.
- **Butcher / fishmonger** — 🆕 cut/yield costing; ♻️ use-by management; 🆕 batch/lot traceability + recall pull-lists; 🆕 QUID + allergen labels; 🆕 scale integration.
- **Bakery / deli / farm shop** — 🆕 production (bake-to-demand) forecasting; 🆕 PPDS/Natasha's Law label generation; ♻️ per-SKU hot/cold VAT logic.
- **Vape / CBD** — 🆕 compliance-by-design: age + refusal audit log, MHRA/FSA legality flags, VPD duty + duty-stamp tracking *(Oct 2026)*.
- **Health-food** — ♻️ batch/expiry FEFO markdown; 🆕 health-claims whitelist; 🆕 allergen/PPDS.
- **Discount / pound** — 🆕 photograph-and-price ad-hoc no-barcode SKU entry; 🆕 dead-stock / sell-through reporting.
- **Pet shop** — 🆕 pet-linked loyalty + repeat-order/"subscribe" prompts; ♻️ dated-stock expiry; 🆕 welfare/feed compliance fields.
- **Market traders** — 🆕 phone-first unified inventory + cash/card reconciliation + MTD export *(the gap SumUp/Zettle leave)*.

## E. Phase-2 Till Foundation — fixes before real money (all 🆕, on the till)
- 🆕 **Atomic sale writes** — Mongo transaction (`saleRoutes.js:136,167,184,204`).
- 🆕 **Idempotent sale writes** — clientRef dedupe (double-tap/offline re-sync = one sale).
- 🆕 **Loyalty-total bug fix** (`saleRoutes.js:109-110`).
- 🆕 **Offline-queue key fix** (`pos_offline_queue` vs `vendora_offline_queue`).
- 🆕 **Void-PIN bypass fix** (`saleRoutes.js:346`).

## F. Phase-2 Payments — the margin engine (all 🆕)
- 🆕 **Stripe Connect Express onboarding** (per-shop account).
- 🆕 **Terminal reader integration** (Bluetooth/network, iPad-friendly).
- 🆕 **`application_fee` margin skim** on each card sale.
- 🆕 **Real `cardPaymentService`** — replace the 5-line stub.

---

**Reminder:** a lot is ♻️ (extend/reuse), not 🆕 — the build is smaller than the list looks. Field research picks which vertical module is first; everything in D waits on that.
