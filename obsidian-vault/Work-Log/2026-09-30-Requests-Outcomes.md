# 2026-09-30 — Later additions: Customer requests & Monthly outcomes

Back to [[Work-Log]] · Related: [[2026-09-30-Simpler-Interface]] · [[ADR-002-App-Till-Separation]]

## Goal
Add the two highest-value, fully self-contained "later additions" on top of the Phase-1 core, keeping
scope honest.

## What shipped
- **Customer requests** (`requestStore` + `RequestsView`, Buy hub): log what shoppers ask for;
  re-asking the same open item bumps a **repeat-count** rather than duplicating, so demand rises to
  the top. One tap → buy list + marked stocked; or decline. Scoped key `requests_v1`.
- **Monthly outcomes** (`outcomes.js` + `MonthlyOutcomesView`, More → Money): reports what ACTUALLY
  happened this month — supplier **credit received** (settled claims), **claims/discrepancies
  resolved**, **tasks completed**, **stock-check coverage %**, **waste cost**. Outstanding
  (approved-but-unreceived) credit shows as in-progress. **Estimated "rescued" savings are in a
  separate block**, never mixed into actuals.

## Deliberately NOT built (kept honest)
- **Reviewed invoice extraction** — needs OCR infra; a "reviewable draft" without real extraction
  would be fake. Deferred.
- **Optional till CSV sales import** — buildable next (would give confirmed 'sale' velocity evidence
  instead of the current estimated basis); left for a follow-up so this increment stays focused.

## Verification (actual)
- Vitest: 6 new (repeat-request counting + status/sort; outcomes actuals-vs-estimates + month
  boundaries). Full FE suite **74/74**.
- E2E (headless Chromium 390×844, prod build): request logged twice → count 2 → Stock it adds to buy
  list + marks stocked; outcomes shows £10 received / 50% coverage / £30 rescued (separate). No errors.
- Build clean.

## Data preserved
Additive: scoped key `requests_v1`. Outcomes is read-only aggregation. No business records changed.

## Commit
`feat(app): customer requests + monthly outcomes (later additions)`
