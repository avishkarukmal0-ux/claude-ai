# 🗂️ Feature Inventory — everything built (100% coverage)

Back to [[Home]] · Related: [[Domains-Index]] · [[Two-Setups-Till-and-App]] · [[API-Routes]] · [[Data-Models]] · [[Services]]

> **Canonical list of everything Vendora POS does today**, pulled straight from the code (2026-07-16): **40 backend route groups · 50 models · 35 services · 35 frontend pages** + plan-gating flags. Use this as the line-by-line reference when deciding the [[Two-Setups-Till-and-App|Till vs App split]]. **Where** column: 🏪 Till (web) · 📱 App (mobile) · 🔀 Both · ⚙️ Platform.

## 1. Selling / checkout — the till
| Feature | Backend | Frontend | Where |
|---|---|---|---|
| Full POS till (scan · search · cart · split-tender · receipt) | `/sales`, `promotionsEngine` | `POSPage` | 🏪 |
| Park & recall transactions | `/pos/parked`, `ParkedTransaction` | `POSPage` | 🏪 |
| Refunds / returns | `refundService`, `Refund` | `POSPage`, `TransactionHistoryPage` | 🏪 |
| Supervisor void (PIN) | `saleRoutes` void | `POSPage`, `TransactionHistoryPage` | 🏪 |
| Quick-sell keys | `/pos/quick-keys`, `QuickKey`, `QuickKeyLayout` | (POS) | 🏪 |
| Self-checkout kiosk | `/pos/self-checkout` | `SelfCheckoutPage` | 🏪 |
| Queue-bust roaming till | `/pos/queue-bust` | `QueueBustPage` | 🏪 *(app v2?)* |
| Customer-facing display | `/display`, `customerDisplayService` | `CustomerDisplayPage` | 🏪 |
| Training mode | `/pos/training`, `trainingModeService`, `TrainingSession` | `TrainingModePage` | 🏪 |
| Offline selling queue | `offlineService`, `OfflineQueue` *(client localStorage)* | `OfflineQueuePage` | 🏪 |
| Challenge-25 age check | `/challenge25`, `AgeRefusal` | `Challenge25Page` | 🏪 |
| No-sale / drawer-open log | `NoSaleLog` | (POS) | 🏪 |
| Lottery · mobile top-up · panic button | (in POS) | `POSPage` | 🏪 |

## 2. Payments & receipts
| Feature | Backend | Where |
|---|---|---|
| Tap-to-pay *(simulated — to be replaced)* | `/payments/tap-to-pay` | 🏪 |
| Card-terminal pairing *(stub → Stripe Connect + Terminal)* | `cardPaymentService` | 🏪 |
| Digital / QR receipts | `/digital-receipts`, `DigitalReceipt`, `ReceiptToken`, `ReceiptVerification` | 🔀 |
| Public receipt viewer (no auth) | `/receipt` | ⚙️ |
| Apple/Google wallet passes | `/wallet-passes`, `walletPassService` | 🔀 |
| WhatsApp / SMS / email receipts | `notificationService`, `smsService`, `emailService` | 🔀 |

## 3. Products & inventory
| Feature | Backend | Frontend | Where |
|---|---|---|---|
| Product catalogue CRUD | `/products`, `Product`, `ProductCache` | `ProductsPage` | 🔀 |
| Barcode lookup | `barcodeService`, `GET /products/barcode/:code` | (scan) | 🔀 |
| Stock movements + audit | `StockMovement` | — | ⚙️ |
| Stock-take (desk + mobile camera) | `/stock-take`, `/pos/stock-take`, `stockTakeService`, `StockTake`, `StockTakeItem` | `StockTakePage` | 📱 |
| Expiry tracking + auto-markdown | `/expiry`, `ExpiryMarkdownRule`, `expiryBatches` | `ExpiryDashboardPage` | 🔀 |
| Price history | `PriceHistory`, `supplierPriceService` | — | ⚙️ |
| ESC/POS label printing | `/hardware`, `printerService` | `LabelPrintingPage` | 🏪 |

## 4. Suppliers & purchasing
| Feature | Backend | Frontend | Where |
|---|---|---|---|
| Suppliers CRUD + performance + **cash-&-carry type** | `/suppliers`, `Supplier` | `SuppliersPage` | 🔀 |
| Purchase orders | `/purchase-orders`, `PurchaseOrder` | `PurchaseOrdersPage` | 🔀 |
| Smart reorder (velocity) | `/smart-reorder`, `smartReorderService` | `SmartReorderPage` | 🔀 |
| Supplier invoices / AP | `/invoices`, `Invoice` | `InvoicesPage` | 🏪 |
| AI invoice reader (OCR + price detect) | `/invoice-reader`, `invoiceMatchService`, `ScannedInvoice` | `InvoiceReaderPage` | 🔀 |
| **Cash-&-carry scan → goods-in** *(NEW — planned)* | *reuses invoice-reader template* | *(app)* | 📱 |

## 5. Pricing & margins
| Feature | Backend | Frontend | Where |
|---|---|---|---|
| Per-category **+ per-product** margins | `/margins`, `marginService`, `MarginSettings` | `MarginSettingsPage` | 🏪 |
| Margin calculator + suggested retail + min-margin alerts | `marginService` | `MarginSettingsPage` | 🔀 |
| Promotions engine (multibuy, patterns, active) | `/promotions`, `/pos/promotions`, `Promotion`, `ActivePromotion`, `DiscountPattern`, `promotionsEngine` | `PromotionsPage` | 🔀 |

## 6. Customers, loyalty & fulfilment
| Feature | Backend | Frontend | Where |
|---|---|---|---|
| Customer CRM + trade accounts | `/customers`, `Customer`, `CustomerWatchlist` | `CustomersPage` | 🔀 |
| Loyalty points | `loyaltyService` | `LoyaltyPage` | 🔀 |
| Gift cards | `/gift-cards`, `GiftCard` | `GiftCardsPage` | 🔀 |
| Click & collect / collection orders | `/collection-orders`, `CollectionOrder` | `CollectionOrdersPage` | 🔀 |

## 7. Accounting & finance — see [[Accounting]]
| Feature | Backend | Where |
|---|---|---|
| VAT returns (MTD) | `vatService`, `VatReturn` | 🏪 |
| Payroll PAYE/NI + payslips | `payrollService`, `PayrollRun`, `payslipGenerator` | 🏪 |
| P&L | `profitLossService` | 🏪 |
| Expenses | `Expense`, `AccountingSettings` | 🏪 |
| Xero / QuickBooks sync | `accountingExportService` | 🏪 |
| Open banking feed | `/open-banking`, `openBankingService` | 🏪 |

## 8. Staff & security
| Feature | Backend | Frontend | Where |
|---|---|---|---|
| Staff CRUD (roles/PINs) | `/staff`, `Staff`, `authService` | `StaffPage` | 🏪 |
| Rota / scheduling | `/schedule`, `StaffSchedule` | `SchedulePage` | 🔀 |
| Shift handover | `ShiftHandover` | (cash mgmt) | 🏪 |
| Lone-worker safety | `LoneWorkerSession` | `LossPreventionPage` | 🔀 |
| Audit log | `AuditLog` | — | ⚙️ |

## 9. Loss prevention
| Feature | Backend | Frontend | Where |
|---|---|---|---|
| Incident logging | `/loss-prevention`, `lossPreventionService`, `Incident` | `LossPreventionPage` | 🔀 |
| Shrinkage log | `ShrinkageLog` | `LossPreventionPage` | 🔀 |
| Scan-pattern anomaly alerts | `ScanPattern` | `LossPreventionPage` | 🔀 |
| CCTV references | `cctvService` | `LossPreventionPage` | 🏪 |
| Customer watchlist | `CustomerWatchlist` | `CustomersPage` | 🔀 |

## 10. Insight & AI — see [[Overview-Dashboard]]
| Feature | Backend | Frontend | Where |
|---|---|---|---|
| Overview "This Week" dashboard (theft/waste/margin) | `/overview`, `ownerSummaryService` | `OverviewPage` | 🔀 |
| Nightly WhatsApp owner summary | `notificationService`, `Notification` | (setup panel) | 📱 |
| Reports (X/Z, hourly, category, staff, custom, scheduled) | `/reports`, `reportService`, `ReportSchedule` | `ReportsPage` | 🔀 |
| Market intelligence / trends | `/market`, `trendService`, `MarketTrend` | `MarketIntelPage` | 📱 |
| AI (price suggestion, NL queries) | `/ai` | (various) | 🔀 |
| Alerts | `alertService` | — | ⚙️ |
| **Suggest-to-owner loop** *(NEW — planned)* | *(new model)* | *(app)* | 📱 |

## 11. Cash & hardware
| Feature | Backend | Frontend | Where |
|---|---|---|---|
| Cash drawer (safe drops, payouts, blind counts, handover) | `/cash-drawer`, `cashDrawerService`, `CashDrawer`, `CashActivity` | `CashManagementPage` | 🏪 |
| Printer · scale · scanner | `printerService`, `scaleService`, `/hardware` | (hardware) | 🏪 |

## 12. Platform (SaaS)
| Feature | Backend | Frontend | Where |
|---|---|---|---|
| Multi-tenant + multi-store | `Store` | — | ⚙️ |
| Subscriptions / billing (Stripe) | `/subscriptions`, `Subscription` | `SubscriptionPage`, `SubscriptionSuccessPage` | 🏪 |
| Auth / JWT + store picker | `/auth`, `authService` | `LoginPage` | 🔀 |
| Settings (Store · POS · Loyalty · Security) | `/settings` | `SettingsPage` | 🏪 |

---

## ⚙️ Options layer — plan-gated feature flags
From `models/Subscription.js` `PLAN_FEATURES`. These are the switches gated per plan:

`maxTills · maxStaff · maxProducts · maxStores · maxWholesalers (33) · lossPrevention · loyaltyGiftCards · smartReorder · mobileApp · clickCollect · selfCheckout · xeroSync · quickbooksSync · scheduledReports · apiAccess · multiStore · customReports · prioritySupport · staffScheduling`

**Note:** a **`mobileApp`** flag already exists — the app plugs into billing that's already there. `maxWholesalers: 33` is already gated (relevant to cash-&-carry).

### Pricing tiers (monthly / annual, per month)
| Plan | Monthly | Annual | Notable gates |
|---|---|---|---|
| Trial | — | — | almost everything on, `apiAccess`/`multiStore` off |
| **Starter** | £29 | £23 | most add-ons OFF; 1 till, 3 staff, 500 products, 5 wholesalers |
| **Plus** | £59 | £47 | loss-prev, loyalty, reorder, **mobileApp**, click&collect, self-checkout ON |
| **Pro** | £99 | £79 | everything: Xero/QB, API, multi-store, priority support |

## Known stubs / gaps (from audit — see [[2026-07-16-Two-Setups-Scope-Lock]])
- Card path simulated (`tapToPay`, `cardPaymentService`) → replaced by Stripe Connect + Terminal.
- Sale writes not atomic / not idempotent; loyalty-total bug; offline queue key mismatch; void-PIN bypassable → **till foundation fixes** (next).
- MarketIntel action buttons are dead stubs; SelfCheckout hardcoded PIN `1234`; Park toast-only on the client.
