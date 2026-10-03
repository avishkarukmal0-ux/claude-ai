'use strict';

// Pure, DB-free tests for the backend decimal-safe money util (acceptance Phase 0). Mirrors the frontend.
const {
  toPence, fromPence, round2, sumMoney, mul, money, ROUNDING,
} = require('../utils/money');

describe('money (backend) — decimal-safe currency', () => {
  test('round2 fixes float error and rounds half away from zero', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-2.675)).toBe(-2.68);
  });

  test('toPence / fromPence round-trip', () => {
    expect(toPence(12.34)).toBe(1234);
    expect(fromPence(toPence(99.99))).toBe(99.99);
  });

  test('sumMoney has no drift across many lines', () => {
    expect(sumMoney(Array.from({ length: 10 }, () => 0.1))).toBe(1);
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });

  test('mul rounds the product to the penny', () => {
    expect(mul(1.99, 3)).toBe(5.97);
    expect(mul(2.5, 2.5)).toBe(6.25);
  });

  test('money formats and policy is stated', () => {
    expect(money(1.5)).toBe('£1.50');
    expect(ROUNDING).toMatch(/half away from zero/i);
  });
});
