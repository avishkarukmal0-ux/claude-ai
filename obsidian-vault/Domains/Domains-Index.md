# Domains Index

Back to [[Home]] · Related: [[API-Routes]] · [[Routing-and-Pages]] · [[Data-Models]]

Feature areas of Vendora POS. Each links to the frontend page, backend routes, and services that make it up. Deep-dive notes exist for the active/complex ones.

> For the **exhaustive line-by-line list** of every feature + option (with Till/App/Both tags), see [[Feature-Inventory]]. This page is the grouped overview.

## Command centre
- **[[Overview-Dashboard]]** ⭐ — the owner's "This Week" screen: theft £, waste £, sales & margin. `OverviewPage` · `/overview` · `overviewRoutes`

## Selling
- **[[POS-and-Checkout]]** ⭐ — the till: cart, scan, pay, park, refund. `POSPage` · `/sales` · `promotionsEngine`
- **Self-checkout & Queue-bust** — `SelfCheckoutPage`, `QueueBustPage` · `/pos/self-checkout`, `/pos/queue-bust`
- **Quick keys** — `QuickSellGrid` · `/pos/quick-keys` · `quickKeysService`
- **Customer display** — `CustomerDisplayPage` · `/display` · `customerDisplayService`

## Money & compliance
- **[[Accounting]]** ⭐ — VAT, Payroll, Expenses, P&L. `AccountingPage` · `/accounting` · `payrollService`, `vatService`, `profitLossService`
- **Margins** — `MarginSettingsPage` · `/margins` · `marginService`
- **Subscriptions/Billing** — `SubscriptionPage` · `/subscriptions` · Stripe
- **Challenge 25 / age** — `Challenge25Page` · `/challenge25` · `AgeRefusal`

## Inventory & supply
- **Products** — `ProductsPage` · `/products`
- **Stock take** — `StockTakePage` · `/stock-take` · `stockTakeService`
- **Expiry** — `ExpiryDashboardPage` · `/expiry` · `ExpiryMarkdownRule`
- **Suppliers & POs** — `SuppliersPage`, `PurchaseOrdersPage` · `/suppliers`, `/purchase-orders`
- **Invoices & OCR reader** — `InvoicesPage`, `InvoiceReaderPage` · `/invoices`, `/invoice-reader` · `invoiceMatchService`
- **Smart reorder** — `SmartReorderPage` · `/smart-reorder` · `smartReorderService`
- **Label printing** — `LabelPrintingPage`

## People
- **Staff** — `StaffPage` · `/staff`
- **Scheduling** — `SchedulePage` · `/schedule` · `StaffSchedule`
- **Training mode** — `TrainingModePage` · `/pos/training` · `trainingModeService`

## Customers
- **Customers/CRM** — `CustomersPage` · `/customers`
- **Loyalty** — `LoyaltyPage` · `/loyalty` · `loyaltyService`
- **Gift cards** — `GiftCardsPage` · `/gift-cards`
- **Collection orders** — `CollectionOrdersPage` · `/collection-orders`
- **Digital receipts / wallet passes** — `/digital-receipts`, `/wallet-passes`

## Cash & security
- **Cash management** — `CashManagementPage` · `/cash-drawer` · `cashDrawerService`
- **Loss prevention** — `LossPreventionPage` · `/loss-prevention` · `lossPreventionService`, `cctvService`

## Insight
- **Reports** — `ReportsPage` · `/reports` · `reportService`
- **Market intel** — `MarketIntelPage` · `/market` · `trendService`
- **AI features** — `/ai`

## Ops
- **Settings** — `SettingsPage` · `/settings`
- **Offline queue** — `OfflineQueuePage` · `offlineService`
- **Hardware** — `/hardware` · `printerService`, `scaleService`
