import { describe, it, expect } from 'vitest';
import { validBarcode } from '../InventoryView';

describe('validBarcode — optional, but 8–14 digits when present (re-audit item 4)', () => {
  it('accepts empty (optional) and real EAN/UPC lengths', () => {
    expect(validBarcode('')).toBe(true);
    expect(validBarcode('   ')).toBe(true);
    expect(validBarcode('50000000')).toBe(true);       // 8 (EAN-8)
    expect(validBarcode('5000000000000')).toBe(true);  // 13 (EAN-13)
    expect(validBarcode('50000000000000')).toBe(true); // 14 (ITF-14)
  });
  it('rejects too-short, too-long, and non-numeric codes', () => {
    expect(validBarcode('123')).toBe(false);
    expect(validBarcode('123456789012345')).toBe(false); // 15
    expect(validBarcode('50000abc')).toBe(false);
  });
});
