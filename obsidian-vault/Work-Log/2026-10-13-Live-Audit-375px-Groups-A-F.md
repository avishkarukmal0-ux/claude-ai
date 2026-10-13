# 2026-10-13 — Live audit at 375×812 (Groups A–F)

Back to [[Work-Log]] · [[Home]]

**Domain(s):** [[Buying]] · [[Accounting]] · [[Onboarding]]
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Clear the open items from the 375×812 live audit: camera/scan, delivery form, claims/price, Buy tab, onboarding scope, PWA polish. Ground rules: ≥44px tap targets, named aria-labels on icon/repeat buttons, no native confirm/prompt/alert in these flows, ≥12px text, destructive/money actions get a dialog or Undo.

## Changes (by group)
**A — Camera / Scan** (commit 21111eb)
- New shared `components/scan/TypedBarcodeEntry.jsx` — typed barcode + Check, 8–14 digit validation + inline hint; shown in Scan-to-identify idle AND under the camera in camera+rapid modes, so a blocked/erroring camera never strands the user (A1). Rapid book-in gains typed entry.
- `BarcodeScanner.jsx`: Turn on camera / Not now / Close camera / torch / overlay close → 44px (A2).
- `lib/demo.js`: every demo product now gets a valid numeric EAN-13 (+ case barcode) via `demoEan(id)` — the old `D-COLA` text codes couldn't be found once 8–14-digit validation landed (A4).
- Scan add-product form fields/buttons + Stepper → 44px, aria-labels (A5). (Polyfill already present.)

**E — Onboarding** (commit cd92508)
- `config/shopTypes.saveShopType` clears niche answers (sellsAnimals/importsFood/festivalsOn) when the FAMILY changes (shop-wide facts kept); switching member keeps them. `lib/businessProfile.clearNicheAnswers`.
- Animal licence + Vet medicines → pet-shop only (`hideForMembers: market-trader, discount-pound`), so Discount/Pound never shows them even with a stale yes (E1). Yes/No + Segment already have aria-pressed + visible state (E2).

**C — Claims / Price / Reconcile** (commit e042cc7)
- Claims: Share / state buttons / Raise claim / Snooze / label-inputs → 44px; Delete claim → ConfirmDialog + Undo (`claimStore.restoreClaim`) + aria-label naming the claim (was native confirm).
- Price changes: Set retail / Keep price → 44px; Set retail shows old→new and fires an Undo toast that restores the old price and re-opens the alert (`priceAlertStore.reopen`).
- Check vs delivery: discrepancies no longer pre-ticked (opt-in, "Tick the lines you want to claim"); picker + checkbox rows → 44px.

**B — Delivery + accessible dialogs** (commit 3fd3427)
- Issue chips now ask "How many units?" (affected qty, seeded, max=delivered) → claim valued on affected units × unit cost, not the whole line; a shortfall surfaces a one-tap "claim as missing" (`claimStore` uses `line.issueQty`, capped at delivered).
- 44px + named aria-labels across the whole line row + Deliveries back / Discard / Repeat; empty "0-line" drafts discarded on leave and pruned on mount (B4).
- Native confirm/prompt removed from the audited flows: Scan "sell past best-before", invoice "Delete file", credit-note delete + duplicate-save → ConfirmDialog. Committed-invoice delete warns it affects Payments due + Price history.

**F — PWA** (this commit)
- `pwa.js`: the update banner now shows ONCE per new version (`_promptedWorker` guard) instead of re-nagging; refresh stays user-controlled (never swaps the build under an active form). Screenshots already in the manifest (F1, prior session).

## Decisions
- Kept the explicit user-consent refresh model (F10) rather than auto-applying on idle/navigation — it already guarantees unsaved input is never discarded, which is F2's core requirement; auto-swap risks interrupting work.
- Demo EANs are deterministic (prefix 20 = in-store range + hash + check digit), so a demo product keeps a stable code.

## Verification
- `npx vitest run` → 79 files, **531** tests pass (+ new: barcode lib, onboarding-scope, claims affected-qty, buyingjourney; creditnote-delete updated to drive the dialog).
- `npm run build` green. Playwright (headless Chromium) at **375×812**: welcome → pick family → Continue → home = **0 console errors**.
- grep of the audited flows (scan/invoices/delivery/claims/pricealerts/buy/reorder/requests/suppliers/orders) for `window.(confirm|prompt|alert)` → only comments remain, no calls.

## Commit(s)
- `21111eb` A · `cd92508` E · `e042cc7` C · `3fd3427` B+dialogs · `<hash>` F + docs. SW v29→v31.

## Follow-ups / could NOT verify
- Native confirm/prompt/alert still exist OUTSIDE the audited A–F flows (till/POS + account/admin): `WasteView`, `StocktakeView`, `account/StaffView`, `account/CloudBackups`, `account/ConflictRecovery`, `inventory/MergeView`, `pages/ExpiryDashboardPage`, `pages/InvoiceReaderPage`, `pages/MarginSettingsPage`, `pages/HomePage` (backup restore), `quicktools/RefusalsLogTool`. Not in this audit's scope — convert in a dedicated pass if wanted.
- Real on-device 375px gesture testing + a true cold-start timeout/retry for "Your area" (D8 retry) still want a device/live check.
