import { describe, it, expect } from 'vitest';
import { validBarcode, isBarcode } from '../barcode';

describe('barcode helpers', () => {
  it('validBarcode: optional — empty allowed, present must be 8–14 digits', () => {
    expect(validBarcode('')).toBe(true);
    expect(validBarcode('   ')).toBe(true);
    expect(validBarcode('50000000')).toBe(true);       // 8
    expect(validBarcode('5000000000000')).toBe(true);  // 13
    expect(validBarcode('123')).toBe(false);
    expect(validBarcode('50000abc')).toBe(false);
  });

  it('isBarcode: strict — requires a real 8–14 digit code (empty is NOT valid)', () => {
    expect(isBarcode('')).toBe(false);
    expect(isBarcode('   ')).toBe(false);
    expect(isBarcode('123')).toBe(false);              // too short
    expect(isBarcode('123456789012345')).toBe(false);  // 15, too long
    expect(isBarcode('5012345678900')).toBe(true);     // 13 (EAN-13)
    expect(isBarcode('50000000')).toBe(true);          // 8 (EAN-8)
  });
});
