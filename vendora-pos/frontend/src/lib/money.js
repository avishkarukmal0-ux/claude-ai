// Decimal-safe currency helpers (acceptance Phase 0). Single source of truth for money maths so figures
// can't drift across many lines from binary-float error.
//
// ROUNDING POLICY (explicit):
//  - Money is entered/held as pounds (a Number with ≤2 decimals of intent).
//  - All arithmetic converts to INTEGER PENCE, operates in pence, and converts back.
//  - Rounding to the penny is HALF AWAY FROM ZERO (so 2.675 → 2.68, −2.675 → −2.68), applied when a figure
//    is stored or shown. A small epsilon corrects representable-float boundary cases (the classic 2.675 bug).
//  - Per-unit costs are kept to the penny; a line total is round2(unitCost × units); a claim/credit total is
//    sumMoney(parts). Never sum already-rounded pounds with +; use sumMoney so it accumulates in pence.
export const ROUNDING = 'half away from zero, to the nearest penny, via integer pence';

const EPS = 1e-6;

/** Pounds → integer pence (half away from zero). */
export function toPence(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + EPS);
}
/** Integer pence → pounds. */
export function fromPence(p) { return (Number(p) || 0) / 100; }

/** Round a pounds amount to the penny under the policy. */
export function round2(v) { return fromPence(toPence(v)); }

/** Sum any number of pounds amounts, accumulating in pence (no float drift). */
export function sumMoney(values = []) {
  let pence = 0;
  for (const v of values) pence += toPence(v);
  return fromPence(pence);
}

/** Multiply a money amount by a (possibly fractional) quantity, rounded to the penny. */
export function mul(amount, qty) { return round2((Number(amount) || 0) * (Number(qty) || 0)); }

/** Format as GBP for display. */
export function money(v) { return `£${round2(v).toFixed(2)}`; }
