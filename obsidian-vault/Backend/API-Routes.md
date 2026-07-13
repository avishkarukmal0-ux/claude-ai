# API Routes

Back to [[Home]] · Related: [[Backend-Overview]] · [[Services]] · [[Data-Models]]

All mounted under `/api` in `src/routes/index.js`. Public routes first, then `authenticate` gates the rest.

## Public (no JWT)
| Mount | File | Purpose |
|---|---|---|
| `/auth` | `authRoutes.js` | login, refresh, register |
| `/receipt` | `receiptRoutes.js` (publicRouter) | public receipt viewer |
| `/subscriptions` | `subscriptionRoutes.js` (publicRouter) | Stripe webhook |

## Authenticated
| Mount | File | Domain |
|---|---|---|
| `/sales` | `saleRoutes.js` | [[POS-and-Checkout]] |
| `/products` | `productRoutes.js` | inventory |
| `/customers` | `customerRoutes.js` | CRM |
| `/staff` | `staffRoutes.js` | people |
| `/cash-drawer` | `cashDrawerRoutes.js` | cash mgmt |
| `/loss-prevention` | `lossPreventionRoutes.js` | security |
| `/reports` | `reportRoutes.js` | analytics |
| `/suppliers` | `supplierRoutes.js` | supply |
| `/purchase-orders` | `purchaseOrderRoutes.js` | supply |
| `/invoices` | `invoiceRoutes.js` | supply |
| `/promotions` | `promotionRoutes.js` | promos |
| `/gift-cards` | `giftCardRoutes.js` | promos |
| `/smart-reorder` | `smartReorderRoutes.js` | inventory AI |
| `/hardware` | `hardwareRoutes.js` | peripherals |
| `/subscriptions` | `subscriptionRoutes.js` | billing |
| `/display` | `displayRoutes.js` | customer display |
| `/digital-receipts` | `digitalReceiptRoutes.js` | receipts |
| `/wallet-passes` | `walletPassRoutes.js` | Apple/Google wallet |
| `/open-banking` | `openBankingRoutes.js` | payments |
| `/schedule` | `scheduleRoutes.js` | rota |
| `/stock-take` | `stockTakeRoutes.js` | inventory |
| `/settings` | `settingsRoutes.js` | config |
| `/pos/parked` | `posParkedRoutes.js` | POS |
| `/pos/promotions` | `posPromotionRoutes.js` | POS |
| `/pos/quick-keys` | `posQuickKeyRoutes.js` | POS |
| `/pos/stock-take` | `posStockTakeRoutes.js` | POS |
| `/pos/training` | `posTrainingRoutes.js` | POS |
| `/challenge25` | `challenge25Routes.js` | age verification |
| `/receipts` | `receiptRoutes.js` | receipts |
| `/collection-orders` | `collectionOrderRoutes.js` | click & collect |
| `/pos/self-checkout` | `selfCheckoutRoutes.js` | self-checkout |
| `/payments/tap-to-pay` | `tapToPayRoutes.js` | payments |
| `/pos/queue-bust` | `queueBustRoutes.js` | queue busting |
| `/expiry` | `expiryRoutes.js` | expiry mgmt |
| `/ai` | `aiRoutes.js` | AI features |
| `/invoice-reader` | `invoiceReaderRoutes.js` | OCR invoices |
| `/market` | `marketIntelRoutes.js` | market intel |
| `/accounting` | `accountingRoutes.js` | [[Accounting]] |
| `/margins` | `marginRoutes.js` | pricing |
| `/overview` | `overviewRoutes.js` | [[Overview-Dashboard]] — `GET /overview/this-week` |

> **Payroll** is served under `/accounting/payroll` (in `accountingRoutes.js`), not a top-level `/payroll`. A stray `payrollRoutes.js` stub that crashed boot was removed — see [[2026-07-13-Fix-Payroll-Route-Mount]].

## Accounting sub-routes (active area)
Under `/accounting` (`accountingRoutes.js`), all `requireRole('supervisor')`:
- `GET /dashboard`
- VAT: `GET /vat`, `POST /vat/preview`, `POST /vat`, `GET/PATCH/DELETE /vat/:id`
- Payroll: `GET /payroll`, `POST /payroll/calculate`, `POST /payroll`, `GET/PATCH/DELETE /payroll/:id`, `PUT/DELETE /payroll/:runId/employee/:staffId`, `GET /payroll/:runId/payslip/:staffId`
- Expenses: `GET/POST /expenses`, `GET/PATCH/DELETE /expenses/:id`
- `GET /pl` (profit & loss)
- Settings: `GET/PUT /settings`

See [[Accounting]] for the full breakdown.
