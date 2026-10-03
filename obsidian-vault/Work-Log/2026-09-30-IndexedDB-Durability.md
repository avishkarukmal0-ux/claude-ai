# 2026-09-30 — Infra Stage 1: IndexedDB durability + safe migration

Back to [[Work-Log]] · Related: [[2026-09-30-Reliability-Review]] · [[ADR-002-App-Till-Separation]] · Phase-1 report: `vendora-pos/PHASE-1-DELIVERY.md`

## Goal
First step of Phase 2 ("infra"). Remove the biggest reliability ceiling on the local-first PWA —
`localStorage`'s ~5 MB cap, lack of transactions, and being the first thing browsers evict — **without**
rewriting every store to be async and **without** a backend or a deploy.

## Approach
Keep the fast **synchronous** storage API the whole app depends on, backed by an in-memory cache
(`MEM`), and mirror every write to **IndexedDB** (large, transactional, resilient). On boot restore
anything missing from `localStorage` out of IndexedDB. If IndexedDB is unavailable, everything
degrades to exactly the previous localStorage-only behaviour.

## What shipped
- **`lib/idb.js`** — tiny promise-based IndexedDB key/value wrapper (`available/getAll/set/del`),
  fully guarded so a browser without IDB (or private-mode failure) reports `available() === false`.
  No dependencies.
- **`lib/storage.js`** — durability layer beneath the unchanged public API:
  - `MEM` map is the synchronous source of truth; `read` serves MEM (lazily hydrated from
    localStorage); `write`/`removeKey` update MEM + localStorage + IndexedDB.
  - **Overflow past the cap:** if localStorage rejects a write (quota) *and* IndexedDB is available,
    the write still succeeds (`{ ok:true, overflow:true }`) instead of being lost. With no IndexedDB
    it still surfaces the visible `STORAGE_ERROR_EVENT` as before.
  - **`initStorage()`** — boot sync: (1) SEED IndexedDB from existing localStorage `vendora:` keys
    it lacks (the migration for existing users); (2) RESTORE keys present in IndexedDB but missing
    from localStorage (evicted / too big), into MEM + localStorage, then fire the workspace event so
    live hooks re-read. **localStorage stays authoritative when present — recovery only fills gaps,
    never overwrites newer on-device data.** Resets the cached active-workspace after a restore.
  - Pluggable backend (`__setDurableBackend`) so the logic is unit-testable without a real IDB and
    without adding a dependency; `copyWorkspace`/`workspaceHasData` now go through MEM (overflow-safe).
- **`main.jsx`** — async `boot()`: if on-device data exists, render immediately and reconcile IDB in
  the background; if localStorage looks empty, briefly await `initStorage()` first so an evicted user
  never sees a false "fresh start" before recovery completes.

## Key decisions (honest + safe)
- **Non-destructive.** Seeding and restore only add/fill; localStorage wins any conflict.
- **No behaviour change without IDB.** All 87 prior tests pass untouched (jsdom has no IndexedDB).
- **No async rewrite of stores.** The synchronous, deterministic read-after-write contract every
  store relies on is preserved.
- Not yet: multi-device sync / accounts (Phase 2 Stages 2–4) — those need the backend + a deploy and
  will stop for explicit approval first.

## Verification (actual)
- Vitest: **8 new** (write-through mirror, remove propagation, boot recovery, first-run seed,
  localStorage-wins-over-stale-IDB, overflow-past-quota succeeds, graceful no-IDB, quota-with-no-IDB
  still errors). Full FE suite **95/95**. Build clean.
- E2E (real headless Chromium — has genuine IndexedDB): seed a shop → confirm IndexedDB mirrored it
  → `localStorage.clear()` (simulated eviction) → reload → **data restored from IndexedDB**, correct
  inventory (qty 7), product visible on Stock. No page errors. This is the decisive proof.

## Data preserved
Additive and non-destructive. Existing users' localStorage is seeded into IndexedDB on first run;
nothing is deleted or overwritten.

## Commit
`feat(app): IndexedDB durability + safe migration beneath sync storage (infra Stage 1)`
