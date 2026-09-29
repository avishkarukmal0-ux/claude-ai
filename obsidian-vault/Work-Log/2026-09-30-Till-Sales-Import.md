# 2026-09-30 — Later addition: Optional till CSV sales import

Back to [[Work-Log]] · Related: [[2026-09-30-Requests-Outcomes]] · [[2026-09-30-Reliability-Review]] · [[ADR-002-App-Till-Separation]]

## Goal
Give shop owners a way to turn **estimated** sell-through into **confirmed sales** by importing a
sales export from their existing till/EPOS — without coupling the app to the deferred till product,
and without ever changing current stock counts. This is the last buildable "later addition".

## Why it matters
Velocity (`movementStore.velocity`) reports a `basis` of `sales | estimated | null`. Before this,
a shop with no in-app selling only ever had `estimated` (inferred from manual stock decreases) or
nothing. Reorder/insights are far more trustworthy on real sales. A till CSV is the cheapest way to
get that evidence with zero new infrastructure.

## What shipped
- **`lib/salesImportStore.js`** (framework-free core + hook):
  - `parseCSV` — RFC4180-ish (quoted fields, escaped `""`, commas-in-fields, CRLF, BOM), returns
    `{ headers, rows[] }`.
  - `guessMapping` — auto-detects barcode / name / qty / date / amount columns; never assigns one
    column to two fields.
  - `parseQty` / `parseAmount` / `parseDate` — tolerant of `£`/symbols; **UK dd/mm/yyyy first**
    (JS `Date.parse` would read `02/03/2026` as mm/dd), then ISO/timestamp fallback.
  - `buildImport` — pure analysis: match by **barcode → then exact (case-insensitive) name**,
    skip unmatched (reported, never invents products), skip invalid/zero-qty and rows older than
    `MAX_AGE_DAYS` (180, = movement retention), **aggregate per product per day** so the log stays
    bounded and velocity's span math stays correct. Returns a deterministic `importId` (FNV-1a
    content hash) + totals + date range.
  - `useSalesImport` — `applyImport` writes one typed `sale` movement per (product, day) bucket via
    `recordMovement` (delta negative, `operationId = batchId = importId`), records history; idempotent
    via `hasOperation`. `undoImport` reverses via `removeByBatch`. `isDuplicate` guards the UI.
- **`components/salesimport/SalesImportView.jsx`** — upload → auto column-mapping (editable selects)
  → live summary (matched units/products, unmatched count, sale value if present, date range) →
  duplicate warning + disabled apply → import; plus a **no-date-column fallback** (pick a single
  date) and a **previous-imports history with Undo**.
- Wired into **More → Data → "Import till sales"** (screen `sales-import`); added `sales_imports_v1`
  to `STORE_NAMES`.

## Key design decisions (kept honest)
- **Never mutates inventory.** Imported sales are historical and already reflected in counts; we only
  append movement evidence. Verified in tests + E2E (stock `[12,8]` unchanged after import).
- **Idempotent by content**, not filename — re-importing the identical file is blocked to avoid
  double-counting velocity; changing the data yields a new hash.
- **No fabricated products or dates.** Unmatched rows are surfaced, not auto-created. If there's no
  date column the owner must choose the date the sales apply to (defaults today).
- Reuses the existing movement idempotency/undo primitives (`operationId`/`batchId`) rather than
  inventing a parallel mechanism.

## Deliberately NOT built
- **Reviewed invoice extraction** — still deferred (needs OCR infra).
- Auto-detecting the shop/till identity from the file — out of scope; the import is per-workspace and
  owner-initiated.

## Verification (actual)
- Vitest: **13 new** (CSV edge cases, header guessing, UK-date parsing, order-independent hashing,
  match/aggregate/skip logic, retention window, apply→velocity-basis-becomes-`sales`, idempotent
  re-import blocked, undo restores). Full FE suite **87/87**. Build clean.
- E2E (headless Chromium 390×844, prod build, real `<input type=file>` upload of a synthetic CSV):
  3 movements written (per product/day), 9 units, 1 row unmatched & skipped, sale value £12.65 shown,
  **stock unchanged**, duplicate re-import warned + apply disabled, Undo cleared movements + history.
  No page errors.

## Data preserved
Additive only: new scoped key `sales_imports_v1`; sale movements are appends. Undo is clean. No
existing business records changed.

## Commit
`feat(app): optional till CSV sales import (velocity evidence)`
