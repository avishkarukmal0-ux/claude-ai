# 2026-10-14 — UX pass 1 (first five minutes, Off-licence)

Eight fixes from a signed-in Off-licence walkthrough, in priority order.

## 1) Add/Edit product validation (was: "abc"/"1,20"/"-3" saved silently)
- New helpers in `InventoryView.jsx`: `parseMoneyInput` (accepts UK comma decimals "1,20"→1.2; rejects text/negatives) and `parseQtyInput` (whole numbers; flags negatives). `FieldError` renders inline `role="alert"` messages.
- AddForm + EditForm now validate on save, show per-field inline errors (red border + `aria-invalid`), and **keep the value the user typed**. A negative quantity is never saved silently — AddForm shows an explicit **"Yes, stock is -N" / "No, fix it"** confirm first.

## 2) Backup messaging (Today)
- The alarming "No backup yet — device only" card now only shows for **guests**. A **signed-in** shop sees a cloud card: "Backed up to the cloud · last synced <time>" (from `useSyncStatus`), or "Saved on this device … backs up when you're online" when offline, or "Backing up…" before the first sync.

## 3) Save feedback + price prompt
- Saving a product toasts **"Saved <name>"**. A product with no sell price shows an inline **"Add a price to see your margin"** link (opens its editor) where the margin would be.

## 4) Niche-specific daily nudges (`todaySignals.js`)
- Added `MEMBER_NUDGES` overriding the family set where it's wrong for the niche. **Off-licence** no longer gets the newsagent "news/mag returns" line — it gets drinks/age-check/MUP nudges. **Vape & CBD** gets MHRA/limits/disposable-ban/CBD-evidence nudges.

## 5) Offline/sync chip in the header
- `HeaderSyncChip` (in `HomePage`): "Offline — saving on this device" whenever the device is offline; "Syncing…"/"Synced" for a signed-in shop; nothing for a signed-out guest online. Sits on its own wrapped line in the header.

## 6) Autofocus
- The Add-product form focuses the **Product name** field on open (`nameRef` + effect).

## 7) Acronyms expanded (MTD/MUP/MHRA/FSA)
- New `common/Abbr.jsx` renders a native `<abbr title>` (hover/long-press tooltip + screen-reader expansion, dotted underline). Wired into the first body mention in MtdCountdown, MupCalculator, VapeProductCheck, SupplementCheck. (Link labels like "(FSA)" already carry context, so left as-is.)

## 8) Optional extras
- **"Order this"** button on a low-stock Stock row → one tap adds it to the buy list (`useBuyList.addItem`), shows "On buy list" once added.
- **"What Vendora helps with"** card auto-hides after the first visit (marks onboarded on mount; still shows that session).
- **"Already using Vendora? Log in"** on the welcome screen is hidden when already signed in.

## Verify
- `npm run build` ✓. Full vitest: **545 passed / 80 files**. SW bumped **v47→v48** (Vercel on push).

## Couldn't verify / notes
- No headless device run here — validated via source, build and the existing suite. No new unit tests added for the parse helpers (module-scoped); behaviour is simple regex + `round2`.
- "Order this" calls `useBuyList()` per row — fine for a store hook, but if Stock lists grow very large we could lift it to the parent.

Commit: see git log (branch `claude/vendora-pos-v3-KPnI0`).
