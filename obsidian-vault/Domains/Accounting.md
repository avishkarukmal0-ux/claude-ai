# Accounting ⭐

Back to [[Home]] · [[Domains-Index]] · Related: [[API-Routes]] · [[Services]] · [[Data-Models]]

> The active work area. UK accounting suite: **VAT · Payroll · Expenses · P&L**.

## Where it lives
| Layer | File(s) |
|---|---|
| Page | `frontend/src/pages/AccountingPage.jsx` (tabbed: Dashboard, VAT, Payroll, Expenses, Reports) |
| Components | `frontend/src/components/payroll/EditEmployeeModal.jsx`, `frontend/src/components/common/NumericKeyboard.jsx` |
| FE service | `frontend/src/services/accounting.js` |
| Routes | `backend/src/routes/accountingRoutes.js`, `backend/src/routes/payrollRoutes.js`, `backend/src/routes/marginRoutes.js` |
| Services | `payrollService.js`, `vatService.js`, `profitLossService.js`, `marginService.js`, `payslipGenerator.js`, `accountingExportService.js` |
| Models | `PayrollRun`, `VatReturn`, `Expense`, `AccountingSettings`, `MarginSettings` |
| Access | all `requireRole('supervisor')` |

## Margins (pricing)
`marginService` + `MarginSettings` (per store). Target margins drive the suggested retail prices (in Invoice Reader) and the green/amber/red status.

**Resolution order (as of 2026-07-16):** **per-product override → category rule → store default.**
- Store default: `MarginSettings.defaultMargin`.
- Per category: `MarginSettings.categories[]` (`targetMargin`/`minMargin`/`maxMargin`/`vatRate`), UK c-store defaults seeded on first access.
- **Per product: `Product.pricing.targetMargin`** (null = inherit). Resolved by `marginService.getRuleForProduct(settings, product)` — overrides just the target (min/max/VAT stay from the category so alerts stay sensible).
- UI: **Per-Product Margins** table in `MarginSettingsPage.jsx` — search a product, set its % (blank = inherit), optionally **Set & reprice** to the suggested retail. API: `GET /margins/products`, `PUT /margins/products/:id`. See [[2026-07-16-Per-Product-Margins]].

## Payroll
The most complex sub-area.

### Flow
1. **Run Payroll** screen loads active staff into an **hours-entry grid** (include checkbox, rate, regular hours, OT hours, live est. gross).
2. Tap any cell → `NumericKeyboard` (mobile-friendly numeric pad).
3. **Calculate Payroll** → UK 2025/26 PAYE / NI / pension computed **client-side** (mirrors `payrollService`), no server round-trip.
4. **Preview** table shows per-employee breakdown + sticky totals + edit (`EditEmployeeModal`) / delete per row.
5. **Save Run** → `POST /accounting/payroll` with the pre-calculated `employees[]` (manual mode). Backend also supports shift-based auto-calc if no employees sent.

### UK 2025/26 tax constants (keep FE & BE in sync!)
Defined in `payrollService.js` **and** mirrored in `AccountingPage.jsx` / `EditEmployeeModal.jsx`:
- Personal allowance £12,570; basic 20% to £50,270; higher 40% to £125,140; additional 45%
- Employee NI: 8% between PT (£12,570) and UEL (£50,270), 2% above
- Employer NI: 13.8% above £9,100
- Pension auto-enrolment: employee 5% / employer 3% on qualifying earnings £6,240–£50,270
- NMW (21+): £12.21
- Period scaling: weekly ÷52, fortnightly ÷26, monthly ÷12

### Key backend fn
`payrollService.recalculateEmployee(emp, frequency)` — recomputes all tax/NI/pension/net for one edited employee line. Also `calcAnnualTax`, `calcAnnualEmployeeNI`, `calcAnnualEmployerNI`.

### Payroll endpoints
- `GET /accounting/payroll` — list runs
- `POST /accounting/payroll/calculate` — auto-calc from shifts
- `POST /accounting/payroll` — save (accepts manual `employees[]`)
- `PATCH /accounting/payroll/:id` — status (approve)
- `DELETE /accounting/payroll/:id` — delete run
- `PUT /accounting/payroll/:runId/employee/:staffId` — edit one line
- `DELETE /accounting/payroll/:runId/employee/:staffId` — remove one line
- `GET /accounting/payroll/:runId/payslip/:staffId` — PDF payslip

## VAT
- VAT100 nine-box return. `POST /accounting/vat/preview` (calc, unsaved), `POST /accounting/vat` (save draft).
- History rows have **edit status** (Draft/Submitted/Filed) + **delete**.
- Endpoints: `GET /vat`, `GET/PATCH/DELETE /vat/:id`.

## Expenses
- Add/Edit share one form; categories enum; VAT reclaimable flag.
- Endpoints: `GET/POST /expenses`, `GET/PATCH/DELETE /expenses/:id`.

## P&L
- `GET /accounting/pl?from&to` → `profitLossService.generatePL`. CSV export in the page.

## Gotchas learned
- Preview runs are **not yet saved** → edit/delete must work on local state, not call the API with a temp id.
- Never put `flex` on a `<td>` — wrap in a `<div>`.
- `overtimeHours` must be assigned in the PUT route, not just destructured.

## History
See [[Work-Log]] for the payroll/VAT/expenses build entries.
