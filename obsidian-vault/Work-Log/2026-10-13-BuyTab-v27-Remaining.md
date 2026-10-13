# 2026-10-13 — Buy tab (v27) remaining audit items

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Buying]] · [[Accounting]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Clear the nine remaining Buy-tab items from the v27 walkthrough: tap-target sizes, invoice delete confirm+undo, credit-note + payment + invoice-form validation, barcode-length enforcement, the "Done" badge on un-reconciled invoices, and the PWA install screenshots.

## Changes
- `src/components/buy/BuyingJourneyView.jsx` — stage pip labels `text-[9px]` → `text-xs` (item 1).
- `src/components/invoices/InvoiceCaptureView.jsx` (item 2 + 7) — invoice **Delete** 24px → 44px with `aria-label="Delete invoice <ref>"`, now a `ConfirmDialog` + **Undo** toast (was `window.confirm`); Commit / Check vs delivery / Delete file / Back-up buttons → 44px; ReviewForm Supplier input + Save draft + Commit → 44px; negative line cost → inline blocking error (`lineIssue`), not a silent clamp.
- `src/lib/invoiceStore.js` — `removeInvoice` now returns the removed record + its stored file; new `restoreInvoice(invoice, file)` for Undo; `addPayment` **rejects overpayment** (amount > owed, when the total is known) with the owed figure (item 4).
- `src/components/invoices/CreditNotesView.jsx` (item 3) — AddForm shows inline validation ("Enter the supplier." / "Enter an amount greater than £0.") on touch; fields + Save/Cancel → 44px.
- `src/components/buy/PaymentCalendarView.jsx` (item 4) — due-date control 28px → 44px + `aria-label`; overpayment surfaced via the store's new error.
- `src/components/orders/OrdersView.jsx` (item 5) — "Mark all arrived" now fires an **Undo** toast (captures pre-arrival state, `restoreOrder`); "Mark as sent" button already present, copy references it — left as-is.
- `src/lib/barcode.js` (NEW) — single source of truth: `validBarcode` (optional-aware) + `isBarcode` (strict 8–14 digits). `InventoryView` re-exports `validBarcode` from here (keeps existing imports/tests working).
- `src/components/scan/ScanIdentifyView.jsx` + `src/components/delivery/DeliveryReceivingView.jsx` (item 6) — typed/manual barcode must be 8–14 digits (`isBarcode`): Check/Add gated + disabled, inline "A barcode is 8–14 digits." error; inputs → 44px.
- `src/lib/buyingJourney.js` (item 8) — a committed invoice with **no received delivery** no longer badges "Done": its invoice stage is `current` ("Check vs delivery") so the journey stays in-progress until reconciled; only reads complete once a claim on it is fully settled.
- `public/manifest.webmanifest` + `public/screenshots/` (item 9) — added **real** install screenshots (narrow 390×844 + wide 1280×800), captured from the built app with the pre-installed Chromium, referenced with `form_factor`.
- `public/sw.js` — `CACHE_VERSION` v28 → v29.
- Tests: `lib/__tests__/barcode.test.js` (NEW, validBarcode + isBarcode); `buyingjourney.test.js` gains the "committed invoice, no delivery → not Done" case.

## Decisions
- Overpayment is **rejected** (not capped/recorded as credit): this is a cash-flow reminder, so a payment exceeding the owed amount is almost always a typo — reject with the owed figure. Only enforced when the invoice has a known total.
- Negative **cost** is an error (typo); a negative **quantity** remains the way to enter a credit/refund line — the error text points there.
- Screenshots are genuine app captures (Playwright-core + the pre-installed Chromium), not mock-ups; `playwright-core` was installed `--no-save` so no package.json/lock churn.

## Verification
- `npx vitest run` → 78 files, **526** tests pass (+4). `npm run build` green; `dist/screenshots/*` present; manifest parses.

## Commit(s)
- `<hash>` — fix(buy): v27 audit — invoice delete confirm+undo, validation, 8–14 barcode, journey Done fix, 44px, manifest screenshots

## Follow-ups
- [ ] (none outstanding from this list)
