# Conventions

Back to [[Home]] · Related: [[Architecture]] · [[Work-Log]]

House style observed across the codebase — follow these when adding code.

## Git workflow
- Active branch: **`claude/vendora-pos-v3-KPnI0`** — all work commits here.
- Push with `git push -u origin claude/vendora-pos-v3-KPnI0`.
- Commit messages: conventional prefixes — `feat:`, `fix:`, `chore:`, `docs:`.
- Keep the working tree clean; don't commit `package-lock.json` churn from incidental `npm install`.

## Backend patterns
- **Thin routes, fat services.** Routes validate + auth + shape the response; calculations live in [[Services]].
- Every route wrapped in `try/catch` → `next(err)`; central `errorHandler` formats.
- Throw `new AppError(message, statusCode)` for expected errors.
- Scope every query by `store: req.storeId` (multi-tenant).
- Role gate: `router.use(requireRole('supervisor'))` or per-route.
- Money helpers: round to 2dp with a local `r2()` (`Math.round(n*100)/100`).
- Response shape: `{ success: true, ...data }` or `{ success:false, error:{ code, message } }`.

## PWA local-first patterns (2026-09-30, see [[ADR-002-App-Till-Separation]])
- **All on-device storage goes through `lib/storage.js`** — never `localStorage.getItem/setItem` directly
  in a store. It scopes keys to the active workspace, surfaces write failures (don't swallow them), and
  since 2026-09-30 (infra Stage 1, [[2026-09-30-IndexedDB-Durability]]) keeps a synchronous in-memory
  cache mirrored to **IndexedDB** (`lib/idb.js`): writes overflow past localStorage's ~5MB cap and
  `initStorage()` (called in `main.jsx`) restores data localStorage lost. localStorage stays
  authoritative; IndexedDB recovery only fills gaps. Keep the storage API synchronous — don't make stores async.
- Stock only changes via a **typed movement** (`movementStore`): a manual qty edit is `stock_adjustment`,
  a sale is `sale` (`sellUnits`), binning is `waste` (`recordWaste`). Never infer a sale from any decrease.
- **Unknown ≠ zero.** `margin()` and valuations return null / exclude unknown-cost items; show coverage.
- Persist **deterministically**: read → compute → `persist()` synchronously → `setState` → then log the
  movement. Don't read a value you assigned inside a `setState` updater (it runs later).
- Backups: validate → snapshot → write → rollback on failure; never touch non-app (token/account) keys.
- Frontend tests: **Vitest** (`npm test` in `frontend`). Backend DB-free tests: `npm run test:unit`;
  integration needs Mongo (`VENDORA_TEST_URI`). Don't weaken assertions to go green — split, don't skip.

## Frontend patterns
- One `services/*.js` module per API domain, each a thin axios wrapper.
- Pages fetch via `useCallback` + `useEffect`; toast on error.
- Tailwind utility classes inline; lucide-react icons.
- Optimistic UI updates where safe, with server reconciliation.
- `fmt(n)` → `£${Number(n||0).toFixed(2)}` for currency display.
- Modals: fixed overlay `fixed inset-0 bg-black/50 flex items-center justify-center z-50`.
- ⚠️ Never put `flex` directly on a `<td>` (renders as table-cell). Wrap children in a `<div className="flex">`.

## UK domain rules (important!)
- **Tax year 2025/26** constants live in `backend/src/services/payrollService.js` and are mirrored client-side in payroll components. Keep them in sync. See [[Accounting]].
- VAT, NI thresholds, NMW, PAYE bands are UK-specific — don't "simplify" without checking HMRC figures.
- **Dates are UK dd/mm/yyyy.** When parsing user/CSV dates, handle `dd/mm/yyyy` explicitly before falling back to `Date.parse` — JS reads `02/03/2026` as mm/dd (US). See `lib/salesImportStore.js` `parseDate`.

## Naming
- Models: PascalCase singular (`PayrollRun`, `VatReturn`).
- Routes files: `<domain>Routes.js`.
- Services: `<domain>Service.js`.
- Frontend pages: `<Name>Page.jsx`.
