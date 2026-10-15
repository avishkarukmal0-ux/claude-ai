# 2026-10-15 — UX pass 3 (takings, age check, refusals log)

On the canonical line (`ebd54ca`, Vercel production). The earlier `58deaa3` checkout was a 3 Oct ancestor, discarded.

## 1 & 2) Takings (`takings/TakingsView.jsx` + new `lib/numberInput.js`)
- All five money fields (Card / Cash / Float / Counted / Pass-through) validate like the product form:
  accept UK comma decimals ("1,20" → 1.20), **reject text and negatives** with an inline `role="alert"`
  message + `aria-invalid` on the field, and keep the typed value. Totals now run off the PARSED values (a
  half-typed "1,20" no longer silently reads as £0), Save is disabled while any field is invalid, and Save
  writes the parsed numbers.
- One-line help under **Float £** ("Cash in the drawer when you opened") and **Counted £** ("Cash in the
  drawer now"). The **Expected £ … short/over** panel and the **Takings today** figure are `role="status"`.

## 3) Age check (`quicktools/AgeCheckHelper.jsx` + handoff)
- The result ("OK / Under age / Do not sell") is `role="status"`.
- When the result is **Under age** or **Do not sell**, a **"Log this refusal"** button opens the Refusals log
  pre-filled: reason = *Under age*, product = the selected tab (Alcohol / Vapes & nicotine / Tobacco).
- Handoff is wired in `HomePage`: the quick-tool dialog passes `onLogRefusal` to Age check and `prefill` to the
  Refusals tool, switching `activeTool` to `QUICK_TOOLS['refusals-log']`.

## 4) Refusals log (`quicktools/RefusalsLogTool.jsx`) — confirmed + hardened
- **Empty submit now blocked:** every entry already carries a reason (required select, default *Under age*) and
  a date/time; the Log button is now disabled until at least the **product, a note, or staff initials** is
  entered (with a hint), so a blank tap can't add an empty audit row.
- **Date + time stored:** `addRefusal` stamps `at: Date.now()`; each row shows "D Mon, HH:MM".
- **Listed & exported:** the last 30 entries show under "Recent refusals"; **Export** downloads all of them as
  `refusals-YYYY-MM-DD.csv` (`refusalsCsv`). Weekly manager sign-off is also tracked.
- Accepts the Age-check `prefill`.

## Verify
- `npm run build` ✓. Full vitest **547 passed / 80 files**. SW v52→v53.
