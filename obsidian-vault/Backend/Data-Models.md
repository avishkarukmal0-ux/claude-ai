# Data Models

Back to [[Home]] · Related: [[Backend-Overview]] · [[API-Routes]] · [[Domains-Index]]

60+ Mongoose schemas in `vendora-pos/backend/src/models/`. All tenant data is scoped by `store`. Grouped by domain below.

## Core commerce
- `Store` — the tenant; every doc references it
- `Product`, `ProductCache` — catalogue
- `Sale`, `Refund` — transactions
- `Customer`, `CustomerWatchlist` — CRM
- `ParkedTransaction` — held sales
- `OfflineQueue` — offline-captured sales awaiting sync

## Inventory & supply
- `Supplier`, `PurchaseOrder`
- `StockMovement`, `StockTake`, `StockTakeItem`
- `PriceHistory`
- `Invoice`, `ScannedInvoice` — supplier invoices (+ OCR)
- `ExpiryMarkdownRule` — auto-discount near-expiry stock

## People & payroll
- `Staff` — employees (holds `payroll.hourlyRate`, PIN, role)
- `StaffSchedule` — rota
- `PayrollRun` — a pay period with embedded employee lines → see [[Accounting]]
- `TrainingSession` — training mode records
- `LoneWorkerSession` — lone-worker safety

## Accounting (see [[Accounting]])
- `VatReturn` — VAT100 boxes
- `Expense` — business expenses
- `AccountingSettings`, `MarginSettings`

## Promotions & loyalty
- `Promotion`, `ActivePromotion`, `DiscountPattern`
- `GiftCard`
- `QuickKey`, `QuickKeyLayout` — POS quick-sell buttons

## Cash & loss prevention
- `CashDrawer`, `CashActivity`
- `NoSaleLog`, `ShiftHandover`
- `Incident`, `ShrinkageLog`, `ScanPattern` — loss prevention
- `AgeRefusal` — Challenge 25 refusals
- `AuditLog` — security audit trail

## Receipts & fulfilment
- `DigitalReceipt`, `ReceiptToken`, `ReceiptVerification`
- `CollectionOrder` — click & collect

## Billing & market
- `Subscription` — Stripe subscription state
- `MarketTrend` — Google Trends data
- `ReportSchedule` — scheduled report config
- `Notification` — delivery outbox for owner messages (nightly summary); idempotent via unique `dedupeKey`. See [[2026-07-16-Nightly-WhatsApp-Summary]]

## Recent field additions
- `Store.ownerSummary { enabled, channel, whatsappTo, sendAt }` — nightly summary opt-in ([[2026-07-16-Nightly-WhatsApp-Summary]])
- `Product.pricing.targetMargin` — per-product margin override (null = inherit category/default) ([[2026-07-16-Per-Product-Margins]])

## Tips
- To trace a feature end-to-end: pick a model here → find its `*Routes.js` in [[API-Routes]] → its `*Service.js` in [[Services]] → its page in [[Routing-and-Pages]].
