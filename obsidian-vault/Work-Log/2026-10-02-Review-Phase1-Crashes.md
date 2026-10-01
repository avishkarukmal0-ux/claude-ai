# 2026-10-02 — Review mandate Phase 1a: null-data crashes, error recovery, empty states

Back to [[Work-Log]] · [[Home]] · follows [[2026-10-02-Phase3-Mobile-Operations]]

**Domain(s):** [[Domains-Index]] — Inventory/Stocktake, Monthly outcomes
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
Reproduce and fix two verified crash flows from the review of `f321872` (fresh guest workspace, no stock):
- **Scan → Count stock** → `TypeError: Cannot read properties of null (reading 'length')`
- **More → This month** → `TypeError: Cannot read properties of null (reading 'filter')`
Fix the underlying null-data handling (not hide it), add screen-level error recovery and empty states.

## Findings — both STILL existed at HEAD (`ea9ac9f`), reproduced with RTL
The store `load()` guards (`Array.isArray(a) ? a : []`) were already present even at `f321872`, so they
were a red herring. The real root cause is one line in `stocktakeStore.loadJSON`:

```js
const v = readJSON(name, undefined);   // BUG
return v === undefined ? fallback : v;
```
`readJSON(name, fallback = null, …)` has a **default parameter**, so passing `undefined` explicitly makes
`fallback` become `null`. So `readJSON(H_KEY, undefined)` returns `null`, `loadJSON` returns `null`, and
`history` is `null`. That single null then crashed **both** screens:
- `StocktakeView.jsx:108` → `history.length`.
- `MonthlyOutcomesView` passed `stocktakeHistory: null` into `monthlyOutcomes`, whose `= []` default only
  catches `undefined` → `null.filter`.

## Changes
- `src/lib/stocktakeStore.js` — replaced `loadJSON` with `loadSession()`/`loadHistory()` that pass the real
  fallback straight to `readJSON` and coerce history to an array. Root-cause fix.
- `src/lib/outcomes.js` — `monthlyOutcomes` now coerces every array input (`Array.isArray(v) ? v : []`), so
  an explicit `null` can never throw. Defence in depth.
- `src/components/ErrorBoundary.jsx` — added an `onReset` prop ("Back to home"), a "your data is safe" line,
  and it now records the failure to diagnostics (metadata only).
- `src/pages/HomePage.jsx` — wrapped the whole `<main>` screen/tab region in `<ErrorBoundary key={screen||tab}
  onReset={() => setScreen(null)}>`. Previously screens rendered with **no** boundary (the only one lived in
  the unused `Layout.jsx`), so any screen crash blanked the whole app. Now a crash shows a recovery card.
- `src/components/outcomes/MonthlyOutcomesView.jsx` — added an empty state ("Nothing recorded yet this
  month") for a brand-new shop instead of a wall of £0.00. (StocktakeView already had "Add stock first".)

## Verification
- New `src/lib/__tests__/phase1-crashes.test.jsx` (7 tests, RTL): both screens render without throwing across
  **empty / populated / restored / account-switched** workspaces; `monthlyOutcomes` null-robustness.
- Full suite **274/274** (was 274 incl. these 7; prior count 267 + 7). `npm run build` clean.
- Browser check: pending (sandbox can't reach the live PWA; logic covered by RTL + build).

## Gotchas → promote to [[Conventions]]
- **`readJSON(name, undefined)` returns the default (`null`), not `undefined`.** Never pass `undefined` to a
  param that has a default and expect to branch on it. Always pass the real fallback to `readJSON`.

## Commit(s)
- `6d54bba` — fix(pwa): null-safe stocktake history + screen error recovery (Phase 1a)

---

# Phase 1b — correct credit reporting

## Finding — monthly outcomes mis-counted credit
`monthlyOutcomes` counted only fully-`settled` claims' `receivedAmount` at their *settled* date, and summed
open-claim `approved||requested` as outstanding **without subtracting received**. So: partial credits on open
claims were invisible; a credit received in one month but settled in another landed in the wrong period;
outstanding ignored money already banked.

## Changes
- **`src/lib/creditReport.js` (new, pure)** — single source of truth for credit accounting:
  - `claimTarget` (approved→requested→items), `claimReceived` (sum of dated `credits[]`, else legacy
    `receivedAmount`), `claimOutstanding` (max(0, target−received)).
  - `allocationsOf` — confirmed dated allocations; legacy rolled-up amounts attributed to the settled date.
  - `creditReceivedInPeriod` — each allocation counted in the month of its own `at`, across ALL claims
    (partials on open claims included), accumulated in integer pence.
  - `creditOutstanding` — Σ max(0, target−received) over open claims (received subtracted).
  - `creditSummary` — requested/approved/received kept distinct.
- **`src/lib/creditNoteStore.js`** — removed its divergent local `claimOutstanding`; now imports + re-exports
  the canonical one (import path unchanged for CreditNotesView/actionEngine/notifications/report).
- **`src/lib/outcomes.js`** — `monthlyOutcomes` uses `creditReceivedInPeriod` + `creditOutstanding`.

## How each requirement is met
- *Count each allocation in the period received* → `creditReceivedInPeriod` uses `credit.at`.
- *Include partials on open claims* → iterates all claims, not just settled.
- *Subtract received from outstanding* → `claimOutstanding = target − received`.
- *Keep requested/approved/received distinct* → separate fields in `creditSummary`/`claimTotals`.
- *Corrections & reversals without double counting* → received summed from `credits[]`, which void/unapply
  remove (claimStore.removeCredit); re-allocating a note replaces its slice.
- *Historical compatibility* → legacy claims with only `receivedAmount` still counted (dated to settle).
- *Decimal-safe + explicit rounding* → all via `lib/money` (integer pence, half-away-from-zero).

## Verification
- `src/lib/__tests__/creditreport.test.js` (12) proving each requirement above.
- Full suite **286/286**; build clean. Existing creditnotes/scenarios/report/notifications suites still green
  (behaviour preserved through the re-export).

## Commit(s)
- (this commit) — fix(pwa): correct credit reporting — received-period, partials, netted outstanding (Phase 1b)

## Follow-ups
- [ ] Surface the distinct requested/approved/received in the UI (Phase 5 payment calendar can reuse
      `creditSummary`).
