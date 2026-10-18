# Conventions

Back to [[Home]] · Related: [[Architecture]] · [[Work-Log]]

House style observed across the codebase — follow these when adding code.

## Git workflow
- Active branch: **`claude/vendora-pos-v3-KPnI0`** — all work commits here.
- Push with `git push -u origin claude/vendora-pos-v3-KPnI0`.
- Commit messages: conventional prefixes — `feat:`, `fix:`, `chore:`, `docs:`.
- Keep the working tree clean; don't commit `package-lock.json` churn from incidental `npm install`. (A lockfile change that *resolves an advisory* is not incidental — commit it.)

## Dependency advisories (2026-10-11, see [[2026-10-11-Deps-Dev-Tooling-Majors]])
- **Separate prod from dev.** Judge real exposure with `npm audit --omit=dev`. Both apps are at **0 production advisories**; what remains is dev/CI-only tooling (test runner, bundler, linters) that never ships in the bundle.
- **`range:*` means no fix exists** — every published version is flagged. npm's `fixAvailable` for these is often a *downgrade* (saw `nodemon@1.14.10`, `jest@25`): ignore it. Standing irreducible residuals, both dev-only trusted-input DoS, **accepted**: `braces` (FE+BE, via chokidar/micromatch) and `sprintf-js` (BE, via `@istanbuljs/load-nyc-config`→js-yaml@3). Re-check at each `npm audit` for a future upstream patch.
- **Never force a transitive major just to silence an advisory** (`npm audit fix --force`, or an `overrides` that crosses a major a parent pins). E.g. forcing `js-yaml@4` would break `load-nyc-config`'s `safeLoad` for a non-exploitable dev DoS.
- **Prefer the smallest upgrade that keeps the production build engine.** vite 8 moved the bundler to **Rolldown** (breaks the `manualChunks` object form); for a dev-only gain we stayed on **vite 7 (Rollup 4)**. Don't swap the shipped-bundle toolchain for a dev-only advisory.
- **tailwind 4 is a CSS-first rewrite** — raises the browser floor (Safari 16.4+/Chrome 111+) and risks UI-wide visual regressions. Not worth it for in-store PWA devices unless there's a real benefit (it clears no advisory).
- Upgrade one major at a time, re-run `npm run build` **and** the full suite, and commit each verified stage separately so rollback stays clean.

## Two-write operations must verify + roll back (audit round 2, see [[2026-10-11-Audit-Round2-Residuals]])
Local-first writes span independent stores (products vs movements/ledger, claim vs credit-note, localStorage vs IndexedDB) with no cross-store transaction. For any operation that writes TWICE:
- **Check the result of the SECOND write**, not just the first. A committed stock change with a failed ledger/history write is "success with missing history" — don't report ok.
- On the second write failing, **roll the first back** and return a plain retriable error.
- If the **rollback ALSO fails**, return a distinct `{ unsafe: true, needsRecovery: true }` — never a generic "please retry" (a naive retry double-applies). The view blocks the retry and tells the owner to reload + verify.
- `persistAll`/store setters only update React state **after** a committed write (`if (res.ok) setX(next)`) — never show an uncommitted value.
- When rolling back an UPDATE to an existing value, restore the **prior** value, not zero.
- **Never use a GridFS `_id` (ObjectId) as a version pointer** — within one second across processes its ordering isn't upload order. Use an atomic monotonic rev (`services/backupRev.js`).

## Recovery & durability survive a reload (audit round 3, see [[2026-10-11-Audit-Round3-Recovery-Paths]])
The recurring round-3 lesson: *a passing helper test does not prove the whole user action commits, rolls back and survives a reopen/reload.* Test the callers, the second save, navigation and adverse interleavings.
- **The overflow path is ASYNC.** `storage.write()` returns `{ok:true, overflow:true}` BEFORE the IndexedDB commit lands. Before deleting the only other copy of anything, confirm the durable commit with `writeDurable()` (flush + read-back) — never trust the synchronous `ok`. (R1)
- **A needs-recovery block must be DURABLE, not React state.** Component state resets on reopen/reload, letting a naive retry re-apply. Persist it in `lib/recoveryGuard.js` (device-local, workspace-scoped, keyed to a stable id like `delivery:<id>` / `product:<id>` / `stocktake`); block the action across reload; clear only on explicit owner acknowledgement. (R3/R4/R8)
- **Verify the second write in EVERY caller, not one.** When you add verify+rollback to a two-write op, grep for every sibling (recordWaste was the one missed in round 2). (R4)
- **Concurrent read-modify-write ⇒ CAS + recompute**, not a conditional `$set` of a value built from a stale read. Guard the write on the exact ordering token read; on a 0-match, re-read and recompute against the committed state (`insightsEntitlementService.setEntitlementCAS`). (R5)
- **Pin identity at the OUTERMOST async entry** and re-check after each await; a pin captured inside a nested callee runs after the caller's own await resolved, missing a mid-flight sign-out/switch. (R6)
- **A productId remap must cover EVERY store that carries one** (top-level or nested) — a missed store strands silently on merge (`productMerge` TOP_LEVEL/NESTED). (R11)
- **Idempotent multi-step completion:** finish a later step (document/order) from the committed operation identity without re-running the first; gate re-application on the operation guard (`hasOperation`). (R10)
- **Record a recovery flag AND check it at the start of the mutating action** — recording a `needsRecovery` block without a pre-check in the SAME caller still lets a retry double-apply (undo did this). Every path that can set a flag must also honour it. (round 4 V1)
- **Compensate a failed second write, don't just report it** — when the second of two cross-store writes fails after the first committed, actively undo the first (e.g. re-apply the removed claim credit) to return to a consistent state; a durable pending-repair flag covers compensation-also-fails. (round 4 V2)
- **When an operation turns async, re-pin EVERY ambient input it reads after an await** (active workspace, session) — the sync→async change is exactly where a previously-safe `getActiveWorkspace()` read becomes a cross-tenant write. (round 4 V3)
- **Only acknowledge an idempotency-ledger event that was actually applied or is genuinely stale** — a transient "couldn't apply right now" (CAS contention) must stay retryable and NOT be recorded processed, or the provider's retry is dropped as a duplicate. (round 4 V4)

## Backend patterns
- **Thin routes, fat services.** Routes validate + auth + shape the response; calculations live in [[Services]].
- Every route wrapped in `try/catch` → `next(err)`; central `errorHandler` formats.
- Throw `new AppError(message, statusCode)` for expected errors.
- Scope every query by `store: req.storeId` (multi-tenant).
- Role gate: `router.use(requireRole('supervisor'))` or per-route.
- Money helpers: round to 2dp with a local `r2()` (`Math.round(n*100)/100`).
- Response shape: `{ success: true, ...data }` or `{ success:false, error:{ code, message } }`.

## PWA local-first patterns (2026-09-30, see [[ADR-002-App-Till-Separation]])
- **Never use `window.prompt` / `window.confirm` / `alert` for input or confirmation** (2026-10-12, see [[2026-10-12-BuyTab-Audit-JPPvn0W2]]). Installed PWAs block or silently ignore them, so a "Record payment" prompt is a dead button on a home-screen install. Use an inline field (44px) for input and the shared accessible `ConfirmDialog` for confirmation; pair any destructive confirm with an Undo toast and a `restoreX` store method (re-insert preserving `id`), never a silent delete.
- **Money sign goes OUTSIDE the £** (2026-10-12) — `-£24.00`, never `£-24.00`. `lib/money.js` `money()` handles this; per-view `money`/`gbp` formatters mirror the same one-liner (`n < 0 ? \`-£${Math.abs(n).toFixed(2)}\` : …`).
- **All on-device storage goes through `lib/storage.js`** — never `localStorage.getItem/setItem` directly
  in a store. It scopes keys to the active workspace, surfaces write failures (don't swallow them), and
  since 2026-09-30 (infra Stage 1, [[2026-09-30-IndexedDB-Durability]]) keeps a synchronous in-memory
  cache mirrored to **IndexedDB** (`lib/idb.js`): writes overflow past localStorage's ~5MB cap and
  `initStorage()` (called in `main.jsx`) restores data localStorage lost. localStorage stays
  authoritative; IndexedDB recovery only fills gaps. Keep the storage API synchronous — don't make stores async.
- Stock only changes via a **typed movement** (`movementStore`): a manual qty edit is `stock_adjustment`,
  a sale is `sale` (`sellUnits`), binning is `waste` (`recordWaste`). Never infer a sale from any decrease.
- Every movement is built through `buildRecord` (movementStore), so each row carries `actor`/`actorId`/
  `actorRole` from the signed-in member ("Owner" for guest). Don't write ledger rows any other way.
- **Reverse, don't delete.** Undoing a stock action appends a compensating entry via `reverseByBatch`
  (`reversalOf` + negated delta), never removes history. `removeByBatch` survives ONLY for sales-import undo
  (re-importing the same file must become possible again).
- **Shared-device safety (Phase 1.4):** signing out or switching accounts purges the departing shop's
  `vendora:<ws>:*` from localStorage + MEM + IndexedDB (`storage.purgeWorkspace`, via `account.logout`/
  `activate`). Use `session.signOut` (flush + final push first) for any sign-out UI; pass `{purge:false}`
  only for an explicit "keep on this device" choice.
- **Revocation bites on the data path:** PWA data routes (sync, notify) re-check a member token with
  `pwaAuthService.assertMemberActive` (cached 30s, invalidated on member admin writes). Add it to any new
  member-accessible data route; owner tokens skip it.
- **Sync is not a backup.** Cross-device sync keeps only the latest value. Recoverable server versions are
  opt-in behind `SYNC_HISTORY` (`SyncBlobHistory` + `/history`/`/restore`); the always-available restore
  point is the local Export. Say so in any UI that might be read as "backed up".

## Decimal-safe money (2026-10-01)
- All currency arithmetic goes through `lib/money.js` (FE) / `utils/money.js` (BE): integer pence, round
  **half away from zero** to the penny. The legacy `r2()` note above is superseded — use the money helpers.
- **Unknown ≠ zero.** `margin()` and valuations return null / exclude unknown-cost items; show coverage.
- Persist **deterministically**: read → compute → `persist()` synchronously → `setState` → then log the
  movement. Don't read a value you assigned inside a `setState` updater (it runs later).
- Backups: validate → snapshot → write → rollback on failure; never touch non-app (token/account) keys.
- Frontend tests: **Vitest** (`npm test` in `frontend`). Backend DB-free tests: `npm run test:unit`;
  integration needs Mongo (`VENDORA_TEST_URI`). Don't weaken assertions to go green — split, don't skip.

## Local-first storage (PWA)
- **`readJSON(name, fallback)` returns `fallback` for missing OR stored-null.** It has a `fallback = null`
  default param, so passing `undefined` explicitly yields `null` — never pass `undefined` and branch on it.
  Always pass the real fallback (`readJSON('x_v1', [])`). This bug once made stocktake history load as `null`
  and crashed two screens (see [[2026-10-02-Review-Phase1-Crashes]]).
- Every store `load()` coerces: `const a = readJSON(NAME, []); return Array.isArray(a) ? a : [];`.
- Pure report/aggregation functions should coerce array inputs too (`Array.isArray(v) ? v : []`): a `= []`
  default only catches `undefined`, not an explicit `null` passed from a hook.
- Screens under `HomePage` render inside a per-screen `<ErrorBoundary key={screen} onReset={…}>` — a crash in
  one screen must never blank the whole app.
- **A store hook must `setState` on its own writes.** The `storage` event only fires in OTHER tabs, so a
  same-tab write won't refresh the hook unless it does so itself: wrap writes in
  `persistAll(next) { const res = persist(next); if (res.ok) setX(next); return res; }` (see `markdownStore`,
  `temperatureLog`, `refusalsLog`). New local-first stores also go in `storage.STORE_NAMES` (to sync/back up)
  and `backup.STORE_SHAPE` (so restore validates the kind).
- **`Number('')` is `0`, not `NaN`.** A blank numeric field validated with `Number.isFinite` passes as 0 — map
  `'' | null → NaN` first (e.g. a blank fridge temperature must be rejected, not logged as 0°C).

## Compliance tools (2026-10-12, see [[2026-10-12-Compliance-Fixes]])
- **Only show what applies.** A tool/deadline that depends on the shop's circumstances is gated, never shown
  universally: MTD via `businessProfile.mtdApplies` (sole traders only, income thresholds by date — Ltd files
  Corporation Tax); MUP by nation (Scotland/Wales only); member-specific tools via `hideForMembers`.
  `getQuickToolsForShop({ familyId, memberId, profile })` is the one gate; a tool with a `gate` but no
  `requiresModule` still passes the module check (the gate decides).
- **Every compliance figure carries its receipt:** a `<ComplianceNote>` (or `compliance.js` `source` +
  `COMPLIANCE_VERIFIED`) with an official GOV.UK/FSA link and a "last verified" date. Re-confirm quarterly.
- **Never help sell past a legal hard stop.** `validateMarkdown` refuses a past use-by / medicine item from
  `expiry` + `dateType` itself, not just the caller's `mustPull` flag.

## Frontend patterns
- One `services/*.js` module per API domain, each a thin axios wrapper.
- Pages fetch via `useCallback` + `useEffect`; toast on error.
- Tailwind utility classes inline; lucide-react icons.
- Optimistic UI updates where safe, with server reconciliation.
- `fmt(n)` → `£${Number(n||0).toFixed(2)}` for currency display.
- Modals: fixed overlay `fixed inset-0 bg-black/50 flex items-center justify-center z-50`.
- ⚠️ Never put `flex` directly on a `<td>` (renders as table-cell). Wrap children in a `<div className="flex">`.
- **Long scrollable lists (hundreds of rows) are windowed with `@tanstack/react-virtual`.** ⚠️ The real scroller is the **WINDOW/document**, not `<main id="main-content">` — the shell's `<main>` has `overflow-y:auto` but **no height cap**, so its `clientHeight` equals its content height and it never actually scrolls. Using `useVirtualizer` with `getScrollElement: () => #main-content` therefore sees a ~150,000px "viewport" and renders every row (no windowing). Use **`useWindowVirtualizer`** instead. Pattern (see `InventoryView.jsx` / `StocktakeView.jsx`): flatten groups into one item array; set `scrollMargin` to the list's **absolute document offset** (`listWrapRef.getBoundingClientRect().top + window.scrollY`, remeasured in a `useLayoutEffect` when content above the list changes height — forms opening, search, counts); position each item absolutely inside a `getTotalSize()`-tall relative container with `transform: translateY(vi.start - rowVirtualizer.options.scrollMargin)` and `ref={rowVirtualizer.measureElement}` for variable heights. Only engage past a threshold (`> 60` rows) so small datasets render the plain markup unchanged. Pair with a **~200ms debounced search** (input controlled by `query`, filtering off `debouncedQuery`) and a **`React.memo` row** fed primitive props + stable `useCallback` handlers, so editing one row re-renders only that row. Sanity check: `document.querySelectorAll('[aria-label^="More actions"]').length` should stay ≲30 while scrolling 600 products.

## Sync + scale (PWA cross-device sync)
- **The server treats each store as an OPAQUE JSON string** — it versions (`rev`) and timestamps (`mtime`) it, never parses it. Per-item semantics are done CLIENT-SIDE at pull time (see per-item merge below), never by teaching the server a store's shape.
- **Per-item merge (`lib/mergeStore.js`)** for the id-keyed stores (inventory, orders, deliveries, claims, credit_notes, movements) so two devices don't clobber each other: on an ongoing pull, UNION local+server by item `id`, newest `updatedAt` wins (ties keep server). Stock **qty is rebuilt from the unioned movement ledger** (`opening + ledgerSum`), never last-write-wins on the absolute number. Every mergeable item must carry `updatedAt`; movements are append-only (union by id). First sync still bootstraps server-wins.
- **Deletes are tombstones, external** (`lib/tombstoneStore.js`, shared `sync_tombstones_v1`): stores keep HARD deletes (array/reads/derivations unchanged) and ALSO `recordTombstone(store, id)`; the merge drops tombstoned ids so a delete isn't resurrected by another device. Undo calls `clearTombstone` and the restore bumps `updatedAt`. Don't reintroduce in-array `_deleted` (it would force load/loadRaw splits across every store).
- **Delta pull:** the client sends `?revs=name:rev,…` + `If-None-Match`; the server returns only newer stores, or **304** when the role-visible `(name:rev)` ETag matches. No `revs` ⇒ all stores (bootstrap). Don't regress the no-args contract — `GET /pull` must still return every blob.
- **Poll cadence** (`sync.js`): 5min idle / 60s while editing / **paused while the tab is hidden**; pushes debounce ≥5s and coalesce all dirty stores into one request. A backgrounded phone must make zero sync calls.
- **Rate limits key by SHOP, not IP, when authenticated** — a shop's devices share one public IP, so IP-keying pools them into one bucket. Verify the token in the keyGenerator (don't just decode) so keying can't be spoofed; fall back to IP for unauthenticated routes. `/api/pwa-sync` has its own generous per-shop bucket (300/min); `authLimiter` keys by email+IP.
- **History (`SyncBlobHistory`) is gated on `SYNC_HISTORY`** and dedupes no-op snapshots; it's capped per store + TTL'd. Don't let any new "backup" write grow unbounded.

## UK domain rules (important!)
- **Tax year 2025/26** constants live in `backend/src/services/payrollService.js` and are mirrored client-side in payroll components. Keep them in sync. See [[Accounting]].
- VAT, NI thresholds, NMW, PAYE bands are UK-specific — don't "simplify" without checking HMRC figures.
- **Dates are UK dd/mm/yyyy.** When parsing user/CSV dates, handle `dd/mm/yyyy` explicitly before falling back to `Date.parse` — JS reads `02/03/2026` as mm/dd (US). See `lib/salesImportStore.js` `parseDate`.

## Naming
- Models: PascalCase singular (`PayrollRun`, `VatReturn`).
- Routes files: `<domain>Routes.js`.
- Services: `<domain>Service.js`.
- Frontend pages: `<Name>Page.jsx`.
