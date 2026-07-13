# Services

Back to [[Home]] · Related: [[Backend-Overview]] · [[API-Routes]] · [[Data-Models]]

Business logic layer in `vendora-pos/backend/src/services/` (48 files). Routes stay thin; services do the real work.

## Accounting & finance (see [[Accounting]])
- `payrollService.js` — UK PAYE/NI/pension calc, `recalculateEmployee`, tax-year helpers ⭐
- `payslipGenerator.js` — PDF payslips (pdfkit)
- `vatService.js` — VAT100 box calculations
- `profitLossService.js` — P&L statement
- `marginService.js` — margin/pricing
- `accountingExportService.js` — CSV/export

## Sales & POS
- `refundService.js`, `parkedTransactionsService.js`
- `promotionsEngine.js`, `quickKeysService.js`
- `offlineService.js` — offline queue sync
- `trainingModeService.js`

## Inventory & supply
- `smartReorderService.js` — reorder suggestions
- `supplierPriceService.js`, `invoiceMatchService.js`
- `stockTakeService.js`, `barcodeService.js`

## Payments & hardware
- `cardPaymentService.js`, `openBankingService.js`
- `cashDrawerService.js`, `printerService.js`, `scaleService.js`
- `customerDisplayService.js`

## Customer-facing
- `loyaltyService.js`, `digitalReceiptService.js`, `walletPassService.js`
- `emailService.js`, `smsService.js`

## Security & ops
- `authService.js` — JWT issue/verify, PIN hashing
- `lossPreventionService.js`, `cctvService.js`, `alertService.js`
- `reportService.js`

## Market intelligence
- `trendService.js` — Google Trends ingestion

## Pattern
Services are plain modules exporting functions. They take primitives/ids, do calculations, touch [[Data-Models]], and return plain data or Mongoose docs. Money is rounded 2dp via a local `r2()`. UK tax constants live in `payrollService.js` — see [[Conventions]].
