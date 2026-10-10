# 2026-10-10 (part 3) — Neighbourhood Age card: bands in age order

Back to [[Work-Log]] · [[Home]]

**Domain(s):** Neighbourhood ([[2026-10-10-Neighbourhood-Cache-Refetch-Fix]], [[Deployment-Config]])
**Branch:** `claude/vendora-pos-v3-KPnI0`

## Goal
The Age breakdown (TS007A, 18 five-year bands) rendered value-sorted (50-54, 35-39, … "85 and over" before
"80 to 84"), which reads wrong for an age histogram, and the 8-row cap hid the 40+ bands. Show age bands in age
order, all of them, no cap. Frontend only; nothing else changed.

## Changes
- `frontend/src/components/insights/NeighbourhoodAreaCard.jsx` — `BreakdownFigure`:
  - **Only when `f.key === 'age'`**: sort a **copy** of `f.rows` by the first integer parsed from each band label
    (`firstNumInLabel`; nothing hardcoded — "Aged 4 years and under" → 4 … "Aged 85 years and over" → 85), and
    render **all** rows with **no cap and no toggle**. If any label has no parseable number, fall back to the
    given (value-sorted) order and still show all; never throws. `f.rows` is never mutated.
  - Every other breakdown (qualifications, economic activity) is unchanged: value-sorted, 8-row cap + "Show all
    N" toggle. Exported `BreakdownFigure` so it can be unit-tested directly.
- `frontend/src/components/insights/__tests__/NeighbourhoodAreaCard.test.jsx` (new) — 5 tests.

## Sort rule (exact)
```js
const firstNumInLabel = (label) => { const m = String(label == null ? '' : label).match(/\d+/); return m ? Number(m[0]) : null; };
// age only, copy-before-sort, fall back to given order if any label unparseable:
if (isAge && all.length && all.every((r) => firstNumInLabel(r.label) != null)) {
  ordered = [...all].sort((a, b) => firstNumInLabel(a.label) - firstNumInLabel(b.label));
}
```

## Decisions
- Parse the first number rather than hardcode band names, so it survives ONS label wording changes; "4 years and
  under" (4) naturally sorts before "5 to 9" (5), and "85 years and over" (85) last — no special 0-case needed.
- Age shows all bands (no cap) because age order is only meaningful as the full histogram.

## Verification
- `frontend`: new `NeighbourhoodAreaCard` tests **5/5**; full suite **376/376** (371 + 5); `npm run build` green.
- Not fully verified yet: the live card render (Vercel) — sandbox can't open the deployed page.

## Commit(s)
- `fix(neighbourhood): render the age breakdown in age order, all bands (frontend only)`

## Follow-ups
- [ ] Owner: confirm the live Age card now reads youngest→oldest with all 18 bands.
