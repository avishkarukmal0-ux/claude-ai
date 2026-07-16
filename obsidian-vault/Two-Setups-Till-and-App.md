# 🧭 Two Setups — The Till (web) and The App (mobile)

Back to [[Home]] · Related: [[Domains-Index]] · [[POS-and-Checkout]] · [[Overview-Dashboard]] · [[Accounting]]

> **Reference plan, locked 2026-07-16.** Vendora ships as **two setups** to each shop: the **Till** (existing web app, at the counter) and a **companion App** (mobile, carried). This note is the source of truth for *what goes where* and *why*. Grounded in a full code audit (see [[2026-07-16-Two-Setups-Scope-Lock]]).

## The governing rule
- **Till (web)** = where money is taken and where the shop is run. Needs the counter + its hardware (drawer, card reader, receipt printer, customer display, scale) or a desk. Used *in place*.
- **App (mobile)** = what you do on your feet or away from the counter — glancing at how the shop is doing, checking shelves, buying stock at the wholesaler. Used *on the move*.

Every feature decision falls out of that rule.

## Locked decisions (2026-07-16)
1. **The app does NOT sell.** All card payments stay on the counter till. → the app needs zero Tap-to-Pay / reader complexity; it is screens + a barcode scan. (Existing `QueueBustPage` roaming-till is parked for a possible later v2.)
2. **Cash-&-carry scanning = on-arrival confirm.** Scanning at the wholesaler builds a *goods-in list*; stock + cost update only when the user taps **Received** back at the shop. Never updates live from the trolley.
3. **Stock-take → app.** `StockTakePage` is already camera-based; it belongs on the phone, walking the shelves.
4. **Payments = Stripe Connect Express + a Terminal reader on the till.** Each shop onboards a Connect Express account; every card sale carries an `application_fee` that skims Vendora's margin. Built **only after** the sale foundation is atomic + idempotent.

## SETUP 1 — The Till (web)
Everything money · hardware · desk.
- **Selling / counter:** POS till, customer display, self-checkout, cash drawer, label printing, offline queue, training mode.
- **All card payments** (Stripe Connect + Terminal reader).
- **Back office:** accounting (VAT, payroll, P&L, expenses), reports (X/Z), margins config, invoices, suppliers admin, staff, settings, subscription, customers/CRM.
- *Pinned here because:* receipt printer, drawer, customer screen, scanner — or it's desk work.

## SETUP 2 — The App (mobile)
Carried · sensing · restock. Two role interfaces.
- **Owner view** — pocket dashboard (reuses [[Overview-Dashboard]]: takings, theft £, waste £, margin, cash) + nightly "shop closed fine" summary.
- **Worker view** — curated, actionable: expiring-soon + trends. *(MarketIntel's action buttons are currently dead stubs — they get wired properly here, not just displayed.)*
- **Suggest-to-owner loop** — NEW, small. Worker flags "stock this" / "mark this down" → owner's inbox.
- **Cash-&-carry scan → goods-in** — the real build. ~70% of backend already exists (see below).
- **Mobile stock-take** — reuses `StockTake` service; new mobile UI.

## Build-vs-reuse (from the code audit)
**Reuse directly:** `Product` schema (cost/barcode/margin/`expiryBatches`), `Supplier` (already has a `cash-and-carry` type + supplier-price catalog), `marginService` (cost-in, no changes), `GET /products/barcode/:code`, `PriceHistory`/`supplierPriceService.recordPrice`.
**Reuse as template:** the invoice-reader goods-in block (`invoiceReaderRoutes.js:294-328`) — "log price → set cost → add stock → optional retail → margin warning" is the exact sequence the scan flow copies; the stock-take `batchCount` pattern for offline bulk scan.
**Build new:** a `stockMovementService.receive()` (stop the 6th inline copy of `$inc`+movement); a goods-in **session** that increments (not overwrites) and updates cost; **unknown-barcode → quick-create** (today an unknown scan 404s); partial/ad-hoc received quantities.

## ⛔ Blocker — fix the Till foundation FIRST
Real Stripe money must not sit on cracked foundations. All of these live on the **till**, independent of the app:
- **Sale writes not atomic** — no Mongo transaction; crash mid-sale leaves stock/cash half-updated (`saleRoutes.js:136,167,184,204`).
- **Sale writes not idempotent** — no clientRef; a double-tap or offline re-sync creates a *second real sale* (`saleRoutes.js:120-124`, `Sale.js` has no dedupe field).
- **Loyalty-total bug** — points burned but customer still charged full price (`saleRoutes.js:109-110`).
- **Offline queue key mismatch** — till writes `pos_offline_queue`, sync page reads `vendora_offline_queue`; they never meet.
- **Void-PIN bypassable** — gate `&& authorisedPin` skips the check when the PIN is simply omitted (`saleRoutes.js:346`).
- Card path is stub/simulation (`cardPaymentService.js`, `tapToPayRoutes.js`) — replaced by the real Stripe Connect + Terminal work.

## Sequence
1. **Till foundation fixes** (atomic + idempotent sale, loyalty bug, offline key, void-PIN). ← next
2. **Stripe Connect Express + Terminal** on the till.
3. **App**: scaffold (React Native) + goods-in scan + owner/worker views + suggest-to-owner + mobile stock-take.
