# 2026-10-01 — PWA audit backlog pass (W1–W17 + PWA-infra)

Back to [[Work-Log]] · Follows [[2026-10-01-Audit2-Response]] (P1/P2 sync+account) · audit:
`uploads/86532f9d-Vendora-PWA-Audit-2026-10-01.md`

Founder asked why the pre-existing backlog wasn't fixed. Worked through it in three verified batches
(each built + tested + pushed). All frontend; each verified against source first.

## Batch 1 — dates, backup, takings, price alerts, forecast (727c9e6)
- **W11** impossible/future dates: `parseDate` rejects non-existent calendar dates; `buildImport` rejects
  future rows; movement windows closed `[since, now]`.
- **W17** corrupt backups: `readBackup` validates each store parses (rejects the whole file if any is
  corrupt) instead of writing garbage that wiped real stock; restore rollback reports its own failure.
- **W14** BST cash-up rollover: `todayKey` formats the LOCAL date (not UTC); month totals by business date.
- **W16** stale price alerts: a new cost-change alert supersedes the prior open one for that product.
- **W13** honest forecast: confirmed vs estimated subtotals + `mixed` basis; Owner glance labels it.

## Batch 2 — stock integrity (6899bc5)
- **W2** phantom allocations: new `reconcileAllocations()` caps shelfQty + trims dated batches to total
  (latest-expiry first) after every decrement (sell/waste/updateProduct-down/stocktake).
- **W1** failed save then contradictory movement: `sellUnits`/`recordWaste`/`bookIn`/`updateProduct` check
  the persist result and bail (no movement) on write failure.
- **W6** stocktake magnitude: `applyCounts` logs the actually-applied delta, not the raw variance.
- **W10** partial sales import: `movementStore.recordMany` writes all movements in one atomic persist;
  a failure writes nothing and stays retryable.
- **W12** imported sales evidence: `inventoryStore.markSold` updates `lastSoldAt` (no qty/movement) so
  imported sales stop reading as never-sold/slow.
- **W7** order un-receive: `receiveAgainst` applies a signed correction clamped to `[0, ordered]`.

## Batch 3 — PWA infra + claims focus (this commit)
- **Offline shell**: the page now posts its loaded hashed JS/CSS to the SW (`CACHE_ASSETS`), which
  precaches them into the runtime cache after first load — a fresh install opened offline now has its
  assets, not just the shell HTML. `sw.js` cache v3→v4.
- **Non-OK shell**: the navigation handler only caches a `res.ok` shell, so an error page is never stored
  as the offline fallback.
- **W9** claim amount focus loss: `ClaimCard` moved to module scope (was redefined inside `ClaimsView`, so
  every keystroke remounted the card and dropped focus); callbacks passed as props.

## Deliberately deferred (documented, lower risk / needs product decisions)
- SW "accept update" reloads every open tab (P2): accepted for the pilot (single-device, small local-saved
  forms), same call as F10; revisit with cross-tab coordination if a shop runs two tabs.
- Quick-tool modal focus trap (P3): a11y polish.
- Category insights uses current price, not recorded sale valuation (P3): reporting nuance; copy already
  says "units × price". Could snapshot valuation later.
- **Needs founder's product call (not bugs):** W8 wrong-price claim should claim the *difference* (needs an
  agreed-price field + editable amounts); W15 customer request marked "stocked" before receipt (needs a
  planned/ordered state); W3 expiry hard-stop on quick-sell (refuse vs warn policy). Flagged for a decision.
- Till cron-not-gated caveat: deferred-product follow-up (till is off).

## Verification
FE **142/142** across the pass (+12 new tests over the three batches); build clean each batch. Camera/SW/
offline behaviours are device-only (verify on phone). The sync atomic-rev + two-device behaviour still want
`test:pwa-sync` on real Mongo + a Render redeploy.

## Commit
`fix(pwa): audit backlog batch 3 — offline precache, non-OK shell guard, claim focus (W9)`
