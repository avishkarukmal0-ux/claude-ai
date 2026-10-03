import { describe, it, expect } from 'vitest';
import {
  toPence, fromPence, round2, sumMoney, mul, money, ROUNDING,
} from '../money';

describe('money — decimal-safe currency (explicit rounding policy)', () => {
  it('round2 fixes binary-float representation error', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);        // 0.30000000000000004
    expect(round2(1.005)).toBe(1.01);           // classic float bug → must round up
    expect(round2(2.675)).toBe(2.68);           // ditto
    expect(round2(5.551115123125783e-17)).toBe(0);
  });

  it('rounds half away from zero', () => {
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-2.675)).toBe(-2.68);
    expect(round2(0.125)).toBe(0.13);
    expect(round2(-0.125)).toBe(-0.13);
  });

  it('toPence/fromPence round-trip', () => {
    expect(toPence(12.34)).toBe(1234);
    expect(toPence(-0.01)).toBe(-1);
    expect(fromPence(1234)).toBe(12.34);
    expect(fromPence(toPence(99.99))).toBe(99.99);
  });

  it('sumMoney accumulates in pence with no drift across many lines', () => {
    const tenths = Array.from({ length: 10 }, () => 0.1); // 0.1 × 10
    expect(sumMoney(tenths)).toBe(1);                      // naive + would give 0.9999999999999999
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    const prices = Array.from({ length: 100 }, () => 1.015); // 100 × 1.015
    // each 1.015 rounds to 1.02 in pence (half-away), summed = 102.00
    expect(sumMoney(prices)).toBe(102);
  });

  it('mul multiplies money by a (possibly fractional) quantity, rounded to the penny', () => {
    expect(mul(1.99, 3)).toBe(5.97);
    expect(mul(0.333, 3)).toBe(1);        // 0.999 → 1.00? no: 0.333×3=0.999 → 1.00
    expect(mul(2.5, 2.5)).toBe(6.25);
    expect(mul(10, 0)).toBe(0);
  });

  it('money formats GBP to 2dp', () => {
    expect(money(1)).toBe('£1.00');
    expect(money(1.5)).toBe('£1.50');
    expect(money(0.1 + 0.2)).toBe('£0.30');
  });

  it('exposes the rounding policy string', () => {
    expect(ROUNDING).toMatch(/half away from zero/i);
  });
});
