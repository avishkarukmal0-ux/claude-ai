# 2026-10-12 — Flows audit (batch 2): persistence, semantics, tap targets, quick-tool correctness

Back to [[Work-Log]] · [[Home]] · related: [[2026-10-12-Flows-375px-Audit]]

**Domain(s):** storage/PWA, service worker, home menu, Staff view, Team tasks, Takings, quick tools (Margin / Age check / Vape duty)
**Branch:** `claude/vendora-pos-v3-KPnI0` · base: `2bec41e`

## Changes (owner's audit batch; no business-logic changes)

### 1. Durable storage — ask to keep it (`lib/storage.js`)
- New `requestPersistentStorage()` (best-effort, idempotent): if `navigator.storage.persisted()` is false it
  calls `.persist()` so on-device data isn't evicted under storage pressure. `initStorage()` fires it once on
  boot (not awaited). The data here is the shop's ONLY copy until they back up, so eviction = data loss.
- Unit-tested (unsupported / already-persisted / grant / throws → never throws, never double-prompts).

### 2. Menu rows are semantic + keyboard-visible (`HomePage.jsx`)
- Audited: the More rows (Takings & cash-up, Team tasks, …), Quick Tools cards, Hub tiles, Chips and bottom
  tabs were **already native `<button>`/`<Link>`** (role + Enter/Space for free). The one gap was the `Row`
  component had **no visible focus ring** — added `focus-visible` ring so keyboard users can see where they are.

### 3. Tap targets → 44px
- **Staff view** (`WorkerBoard`): "Mark down" and "Stock this" flag buttons 29→≥44px (`min-h-[44px]`).
- **Team tasks** (`TasksView`): Owner/Staff toggle 25→≥44px; added `role="group"` + `aria-pressed`.

### 4. Margin calculator (`MarginCalculator`)
- `min=0` on both inputs was already present. A loss now formats as **`-£0.20`** (sign outside the £), never
  `£-0.20`. Zero/empty sell price shows **"Enter a sell price to see the margin."** instead of silent dashes.

### 5. Service worker — purge old runtime bundles (`public/sw.js`)
- Bumped `CACHE_VERSION` v14→**v15**. The activate handler deletes every cache not on the current version —
  because the runtime cache name is version-scoped, the bump purges the previous version's accumulated stale
  hashed JS/CSS instead of letting it pile up across deploys. Clarifying comment added.

### 6. Takings — why "Save today" is disabled (`TakingsView`)
- When the Save button is disabled, a hint now explains it: **"Enter today's card or cash takings to save."**
  (`aria-describedby` wires the button to the hint.)

### 7. Age check (`AgeCheckHelper`)
- Validated in the handler, not just the picker's `max`: a **future DOB → "Invalid date"** (never a negative
  age), an age **> 110 → "Check this date"**. Normal adult/under-18 cases unchanged.

### 8. Vape duty (`VpdCalculator`)
- Price field relabelled **"Current price £ incl. VAT (optional)"**. Empty/invalid size shows **"Enter the
  bottle size (ml) to see the duty."** Suggested price now notes **"Your price + duty + VAT only — your margin
  isn't added."**

## Verification
- **FE 477/477 (+11 new) + production build green.** New suites: `quicktools/__tests__/quicktools-audit.test.jsx`
  (margin format + missing-sell, age future/>110/adult/under-18, vape VAT-label/size-hint/margin-caveat) and
  `lib/__tests__/storage-persist.test.js`.
- **Not performed here:** the live 375px / screen-reader / console re-audit — browser-only (no Playwright in-project).

## Follow-ups
- [ ] Owner: redeploy Vercel (SW bump to v15 → installed PWAs get a Refresh prompt), then re-audit at 375px.
