'use strict';

// Decimal-safe currency helpers (acceptance Phase 0) — backend mirror of frontend/src/lib/money.js.
// Keep the two in step. See that file for the explicit rounding policy.
//  Policy: convert pounds → integer pence, operate in pence, round HALF AWAY FROM ZERO to the penny.
const ROUNDING = 'half away from zero, to the nearest penny, via integer pence';
const EPS = 1e-6;

function toPence(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + EPS);
}
function fromPence(p) { return (Number(p) || 0) / 100; }
function round2(v) { return fromPence(toPence(v)); }
function sumMoney(values = []) {
  let pence = 0;
  for (const v of values) pence += toPence(v);
  return fromPence(pence);
}
function mul(amount, qty) { return round2((Number(amount) || 0) * (Number(qty) || 0)); }
function money(v) { return `£${round2(v).toFixed(2)}`; }

module.exports = {
  ROUNDING, toPence, fromPence, round2, sumMoney, mul, money,
};
