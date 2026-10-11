# 2026-10-11 — PWA polish pass: inventory + credit-note recovery screen

Back to [[Work-Log]] · [[Home]] · related: [[Conventions]] · [[2026-10-11-Audit-Round5-V2-Residual]]

**Domain(s):** whole PWA shell (inventory), invoices/credit notes (recovery screen), home (export guard)
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `d42eca9`

## Scope note (important)
"Polish the entire PWA." The shipped product is the **standalone PWA** — `App.jsx` mounts only 4 routes
(`/` NichePicker, `/home` HomePage shell, `/account`, `/login`); ALL till/back-office pages are behind
`VITE_TILL_ENABLED` (off) and are out of scope (deferred). The vault's older `Home.md` still describes the
till vision — treat ADR-002 + this entry as current. So the real surface to polish is HomePage's screens +
AccountPage.

## PWA feature inventory (the completion checklist)
All reached from the HomePage shell (5 tabs) unless noted. Role-gated screens hidden from `staff` via
`permissions.canSeeScreen`; money/cost screens are owner/manager only. Feature flags: `INVOICES_ENABLED`,
`INSIGHTS_ENABLED`, `NEIGHBOURHOOD_ENABLED`, `ACCOUNTS_ENABLED`.

- **Welcome/account:** `/` NichePicker (shop-type), signed-out SAMPLE/demo mode, `/account` (register/login/
  logout), `/login`, FirstRunCard, onboarding "promises", InstallCard (PWA install).
- **Today tab:** FirstRunCard, TodayActions, TodayAtShop (morning glance), family quick-tools (modal).
- **Scan tab (hub):** scan-identify, receive delivery, count stock, expiry & waste.
- **Stock tab:** InventoryView (products, search, photos, barcodes, merge, history) + chips (count, refill,
  slow stock, by category).
- **Buy tab (hub):** buying journey, buy list (reorder), orders, suppliers, supplier invoices, claims,
  **credit notes**, price changes, price history, compare suppliers, payments due, Neighbourhood Insights
  (add-on), your area, customer requests.
- **More tab:** Money (takings, owner glance, this month, weekly report), Team (tasks, staff view,
  suggestions), Data (import till sales, export backup, restore, cloud version history, recovered changes,
  **credit note repair ← NEW**), Settings (install, notifications, help & diagnostics, change shop type,
  account, staff access, save/sync status).

## Changes this pass
1. **Credit-note recovery screen (`CreditNoteRecoveryView`)** — the one concrete gap. When a credit-note
   two-write correction AND its compensation both fail, round 5 records a durable `creditnote:<id>` flag and
   blocks every mutation, but there was no owner-facing way out. New guided screen: lists each locked note's
   allocations beside the matching claim credits with per-claim match/≠ indicators, reconciles both sides
   through the existing validated ops (`applyCredit`/`removeCredit`/`setAllocation`, which append to claim
   history = the audit trail), then **re-reads both sides from storage and only clears the flag once
   `creditNoteReconciliation` reports them consistent**. A failed write or still-inconsistent re-read keeps it
   locked; double-tap guarded. Surfaced in More → Data (badged) only when a note is locked; owner/manager only.
2. **Export double-tap guard** — `onExport` (async share/download) was ungated; added an in-flight guard
   (`exporting` + disabled Row + "Saving…"), matching the stock/delivery/waste patterns.

## Verification
- **Frontend: 66 files, 456 tests** (was 451; +5: 3 pure `creditNoteReconciliation` + 2 recovery-view render)
  + production build green. New tests: reconcile clears the lock only after both sides verify; a failed
  corrective write keeps it locked.
- Backend untouched this pass.
- Audit fixes (rounds 1–5) all preserved — no changes to recoveryGuard, productImages, inventoryStore,
  storage, billing, productMerge, deliveryStore; CreditNotesView's `noteBlocked` gate + `compensateCredits`
  intact, and the recovery screen only ever clears after a verified re-read.

## Honest coverage
- **Tested (automated):** credit-note recovery screen + helper; export guard path (build); plus the full
  existing 456-test suite over the PWA stores/screens.
- **Source-reviewed (already consistent, no change needed):** the HomePage shell and its screens already use
  one card/Row/Hub/Chip/NavTab system, per-screen ErrorBoundary, focus rings, skip link, safe-area insets,
  honest save/sync status, role gating and feature flags — so no broad restyle was warranted or safe.
- **Not performed:** live mobile screenshots (the `playwright` npm package isn't installed in this project —
  only the Chromium binary is — and adding it is an unwanted dependency; the recovery flow is covered by
  render tests instead), and physical device/camera checks.

## Follow-ups
- [ ] Owner: redeploy Vercel to ship the recovery screen + export guard (no CACHE_VERSION change needed).
- [ ] Optional future polish: an in-UI "clear" affordance for other recovery flags (delivery/waste already
      have banners); a broader double-tap audit of less-used action buttons.
