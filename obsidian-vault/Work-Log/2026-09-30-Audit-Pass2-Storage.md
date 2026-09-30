# 2026-09-30 — Audit pass 2: storage robustness (F2–F5)

Back to [[Work-Log]] · Related: [[2026-09-30-Audit-Pass1-PWA]] · [[2026-09-30-IndexedDB-Durability]]

## Scope
The audit's storage-robustness findings (F2 make IndexedDB authoritative, F3 await transaction commits,
F4 surface save failures, F5 cross-tab races + atomic inventory+movement). Scoped to what genuinely
helps a **single-device PWA in a live pilot** — no risky rewrite mid-pilot. Verified each against code
first; two turned out to already be handled, one turned out to be a real regression the durability work
introduced.

## What I found first (so the fix is proportionate)
- **F4 was already wired.** `write()` returns `{ok,error}` and dispatches `STORAGE_ERROR_EVENT`;
  `App.jsx` already listens and toasts. The only gap: overflow (localStorage-full) writes whose ONLY
  durable home is IndexedDB were fire-and-forget, so a *failed* sole-copy commit was silent.
- **F5 cross-tab was half-there but subtly broken.** Every store hook already listens to the native
  `storage` event and re-reads — but reads now go through `MEM` (the cache added for durability), and a
  second tab's `MEM` can hold a **stale** value that shadows the fresh `localStorage` value the event
  just announced. So cross-tab refresh silently stopped working for cached keys. This is the real bug.
- **F5 atomicity is not a live risk.** Each stock method writes inventory then the movement with two
  **adjacent synchronous** `localStorage` writes (no await between) — they can't tear on-device short of
  a hard kill between two back-to-back calls. Only the async IndexedDB mirror could tear.

## Fixes (`lib/storage.js`)
- **F5 cross-tab (real bug).** One module-level `storage` listener (`__applyCrossTabStorage`),
  registered at import — so it runs before any hook's listener — updates/invalidates `MEM` from the
  incoming change (and handles `key===null` = another tab's `localStorage.clear()`, and the active-
  workspace key). The existing per-store handlers then re-read fresh data. Overflow-only data can't
  sync live cross-tab (no `storage` event fires when `setItem` failed) — accepted; still recovered on
  next boot by `initStorage()`.
- **F3 durability on unload.** Track every in-flight IndexedDB op in `_inflight`; new exported
  `flushDurable()` awaits them. Flush on `pagehide` and `visibilitychange → hidden` (the reliable
  mobile signal), so the last write reaches durable storage before the tab goes away — this also closes
  the only real inventory+movement **durable** tear window.
- **F3/F4 verified overflow.** An overflow write (localStorage rejected, IndexedDB is the sole copy) is
  now marked `critical`: if that async commit rejects, it dispatches `STORAGE_ERROR_EVENT` instead of
  being lost silently.

## Decisions (documented in code + here)
- **F2 (IndexedDB authoritative) — deliberately NOT flipped.** localStorage stays the **synchronous
  authority**; IndexedDB is a durable, now-flushed mirror + recovery source. Flipping authority to an
  async store would push every synchronous read/write and every store hook through an async hydration
  layer — a large, risky refactor to land during a live pilot, on a single-device PWA where localStorage
  is already correct. The durability F2 was really after (survive eviction / exceed the 5 MB cap) is
  delivered by the mirror + `initStorage()` recovery + the new unload flush.
- **F5 atomic co-writes — no heavy transaction API.** The adjacent synchronous writes don't tear
  on-device; the durable-mirror tear is closed by the flush. A synchronous multi-key transaction layer
  would add complexity without closing a real gap.

## Verification
FE full suite **114/114** (4 new: cross-tab fresh-read, cross-tab delete, `flushDurable` awaits a slow
commit, overflow sole-copy failure surfaced). Durability suite 14/14. Build clean.

## Commit
`fix(pwa): audit pass 2 — cross-tab cache coherence (F5), durable flush on unload (F3), surfaced overflow failures (F4)`
