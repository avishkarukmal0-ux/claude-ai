# Routing & Pages

Back to [[Home]] · Related: [[Frontend-Overview]] · [[State-and-Contexts]] · [[Domains-Index]]

Routes defined in `src/App.jsx`. Default redirect `/` → `/pos`.

## Authenticated app routes (inside `Layout`)
| Path | Page | Min role |
|---|---|---|
| `/overview` | `OverviewPage` | **supervisor** ⭐ → [[Overview-Dashboard]] |
| `/pos` | `POSPage` | staff |
| `/products` | `ProductsPage` | staff |
| `/customers` | `CustomersPage` | staff |
| `/staff` | `StaffPage` | **manager** |
| `/reports` | `ReportsPage` | **supervisor** |
| `/cash-management` | `CashManagementPage` | staff |
| `/loss-prevention` | `LossPreventionPage` | **supervisor** |
| `/suppliers` | `SuppliersPage` | staff |
| `/purchase-orders` | `PurchaseOrdersPage` | staff |
| `/promotions` | `PromotionsPage` | staff |
| `/gift-cards` | `GiftCardsPage` | staff |
| `/smart-reorder` | `SmartReorderPage` | staff |
| `/transactions` | `TransactionHistoryPage` | staff |
| `/stock-take` | `StockTakePage` | staff |
| `/expiry` | `ExpiryDashboardPage` | staff |
| `/invoice-reader` | `InvoiceReaderPage` | staff |
| `/market` | `MarketIntelPage` | staff |
| `/schedule` | `SchedulePage` | staff |
| `/invoices` | `InvoicesPage` | **supervisor** |
| `/loyalty` | `LoyaltyPage` | staff |
| `/label-printing` | `LabelPrintingPage` | staff |
| `/offline-queue` | `OfflineQueuePage` | staff |
| `/training` | `TrainingModePage` | staff |
| `/challenge25` | `Challenge25Page` | **supervisor** |
| `/accounting` | `AccountingPage` | **supervisor** ⭐ |
| `/settings/margins` | `MarginSettingsPage` | **supervisor** |
| `/settings` | `SettingsPage` | **manager** |
| `/collection-orders` | `CollectionOrdersPage` | staff |
| `/subscription` | `SubscriptionPage` | staff |
| `/subscription/success` | `SubscriptionSuccessPage` | staff |

## Standalone routes (outside main Layout)
| Path | Page | Notes |
|---|---|---|
| `/login` | `LoginPage` | public |
| `/customer-display` | `CustomerDisplayPage` | second-screen, no auth wrapper |
| `/self-checkout` | `SelfCheckoutPage` | protected, own shell |
| `/queue-bust` | `QueueBustPage` | protected, own shell |

## Page → domain map
Big feature pages and their domain notes:
- `AccountingPage` → [[Accounting]] (VAT / Payroll / Expenses / P&L tabs)
- `POSPage` → [[POS-and-Checkout]]
- others → [[Domains-Index]]

Each page pairs with a `services/*.js` module (see [[State-and-Contexts]]) that calls the matching backend group in [[API-Routes]].
