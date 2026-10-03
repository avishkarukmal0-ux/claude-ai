# 2026-10-01 — PWA audit (2nd) response: correctness + sync/account hardening

Back to [[Work-Log]] · audit: `uploads/86532f9d-Vendora-PWA-Audit-2026-10-01.md` (commit 8e4683c) ·
Related: [[2026-10-01-Polish-Bundle]] · [[2026-09-30-Cross-Device-Sync]]

## Context
A second, source-grounded third-party audit of the ACTIVE PWA (sync/account/scan/storage). It verified FE
128/128 + BE 56/56, then found real defects via isolated reproductions. Several are bugs **this session
introduced** (sync + the scan/category/MUP features). Triaged, verified each against code, fixed the
clear high-value set in two commits. Pre-existing workflow findings (W1–W3, W6–W17, backup, offline SW,
modal focus) are logged as a backlog below — mostly predate this work and are larger.

## Commit 1 — feature correctness (5b1a96e)
Four bugs in features added this session, all verified against source first:
- **W4 case booking:** `bookIn` after a SINGLE-barcode scan used the scan multiplier (1), not the product
  pack size → "book 2 cases" of a 12-pack added 2, not 24. Now uses `product.packSize`; labels agree.
- **W5 rapid double-count:** continuous scanner re-accepted a barcode held in frame every 1.5 s. Now one
  count per presentation — same code only re-counts after the item leaves the frame (3 confirmed empty
  frames re-arm it); a detect() error is not treated as "empty".
- **MUP round-down:** `MupCalculator` floored to nearest/down with a 0.5p tolerance → a price 1p under the
  Scottish minimum showed "OK". Now `Math.ceil(...*100)/100` (round up to next penny, per mygov.scot) and
  strict comparison.
- **Category presets missing:** `getFamily(getSavedShopType())` passed an object where a familyId string
  was expected → family presets (tobacco/alcohol/produce) never appeared. Now `getSavedShopType()?.familyId`
  (InventoryView + ScanIdentifyView).

## Commit 2 — sync + account concurrency hardening (P1/P2)
- **P1 account-switch mid-sync (cross-account leak):** `syncNow` now captures one identity (token + shopId
  + ws) per run, passes that token to every request, and a `guard()` after each await aborts (no persist)
  if the account/workspace changed. `authedRequest` only accepts a refreshed token if the session still
  matches. Test: switch A→B mid-sync → aborts, A's blob never pushed under B.
- **P1 in-flight edit marked clean:** results are merged into a FRESHLY reloaded meta at the end; a blob is
  cleared-dirty only if no newer edit (mtime) landed since we sent it, else it stays dirty with the new rev.
  Test: edit during push → v2 preserved, stays pending.
- **P1 non-atomic server revisions:** `pwaSyncService.push` now uses atomic `findOneAndUpdate` CAS on
  `{account,name,rev}` ($inc rev), with create + LWW-by-mtime fallbacks and conflict on lost race — two
  concurrent pushes can't both claim the same rev. (Single-threaded correctness preserved: BE 56/56; the
  DB-gated `test:pwa-sync` 9 cases still hold by construction — re-run on real Mongo to confirm concurrency.)
- **P1 refresh after logout/switch:** `account.refresh` re-checks the live session after the request and
  throws `session-changed` instead of resurrecting a logged-out session or overwriting a new one. 3 tests.
- **P2 failed remote write acked as synced:** `applyRemote` returns write()'s result; a failed local write
  no longer marks the blob clean — sync reports an error and leaves it to retry.
- **P2 deleted stores never propagated:** a store cleared after being synced is now pushed as an empty
  value so other devices don't resurrect it. Test added.

## Verification
FE **134/134** (+6: in-flight edit, account-switch abort, cleared-store, 3× refresh identity). BE **56/56**,
app boots. Build clean. New tests use injected transport/storage; real-Mongo concurrency + two-device
behaviour still want on-device/`test:pwa-sync` confirmation.

## Backlog (pre-existing / larger — not in these commits)
- W1 failed `persist()` still returns ok then logs a movement (storage-pressure data integrity) — broad,
  across inventoryStore mutators; storage already toasts on hard failure.
- W2 total-qty changes don't reconcile dated batches/shelfQty (phantom allocations); W3 no expiry check on
  quick-sell; W6 stocktake movement vs applied delta; W7 order un-receive; W8 wrong-price claim amount;
  W10 partial sales-import success; W11 future-date rows; W12 imported sales don't update lastSoldAt;
  W13 mixed confirmed/estimated labelled "confirmed"; W14 BST cash-up date rollover; W15 request "stocked"
  before receipt; W16 stale price-alert supersession; W17 backup accepts corrupt stores / non-atomic restore.
- Product audit P2/P3: SW update reloads all tabs; offline shell doesn't precache built JS/CSS; shell can
  cache non-OK responses; quick-tool modal focus trap; category insights uses current price not recorded
  valuation.
Recommend: fix the highest-risk pre-existing ones (W2, W11, W17, offline-precache) in a focused pass before
a wide pilot; the rest are polish. Till cron-not-gated caveat is a deferred-product follow-up.

## Commits
`fix(pwa): audit 2026-10-01 — case booking, rapid double-count, MUP round-up, category presets` (5b1a96e)
`fix(pwa): audit 2026-10-01 — sync/account concurrency hardening (atomic rev, identity guard, tombstones)`
