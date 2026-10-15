import { round2 } from './money';

// Shared money-input validation (mirrors the product form). Accepts UK comma decimals ("1,20" → 1.2); rejects
// text and negatives; blank is allowed (optional field). Returns { value, error } — value is null when
// blank/invalid, error is a human message or null. The caller keeps the raw typed text so nothing is dropped.
export function parseMoneyInput(raw) {
  const s = String(raw == null ? '' : raw).trim().replace(',', '.');
  if (s === '') return { value: null, error: null };
  if (!/^\d*\.?\d+$/.test(s)) return { value: null, error: 'Enter a number, e.g. 1.20' };
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return { value: null, error: 'Enter a number, e.g. 1.20' };
  return { value: round2(n), error: null };
}
