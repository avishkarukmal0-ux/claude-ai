# 2026-10-15 — Exit-demo workspace restore + count chips 44px

Canonical line (`ebd54ca`…). Two fixes + an optional note.

1. **BUG — Exit demo dumped a signed-in owner on the shop-type picker** (`lib/demo.js`). `loadDemo()` switched
   to the `demo` workspace without remembering the previous one, and `exitDemo()` hard-set
   `vendora:active_workspace` to `local` (guest) → a signed-in owner's `shop:<id>` was lost, so they landed on
   "What kind of shop do you run?". Fix: `loadDemo()` records the pre-demo workspace in a global key
   `vendora:workspace_before_demo` (unless already in demo); `exitDemo()` restores it (fallback `local`, never
   `demo`) and clears the key. Test added (enter demo from `shop:abc123` → exit → back to `shop:abc123`).
2. **Count category chips 44px** (`stocktake/StocktakeView.jsx` `CatChip`): were `px-3 py-1.5` (~30px) → now
   `inline-flex min-h-[44px] items-center`.

Optional (not done): windowing the Stock list for hundreds of products — noted for the user; it currently
renders every row.

## Verify
- `npm run build` ✓. Full vitest **549 passed / 80 files** (+1 demo case). SW v57→v58.
