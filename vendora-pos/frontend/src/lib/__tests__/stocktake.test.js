import { describe, it, expect } from 'vitest';
import { buildSummary, isMaterialVariance, MATERIAL_UNITS, MATERIAL_VALUE } from '../stocktakeStore';

describe('stocktake — material variance gating (Phase 2.8e)', () => {
  it('isMaterialVariance trips on either units or value', () => {
    expect(isMaterialVariance(MATERIAL_UNITS, 0.01)).toBe(true);   // enough units
    expect(isMaterialVariance(1, MATERIAL_VALUE)).toBe(true);      // enough £ at cost
    expect(isMaterialVariance(-MATERIAL_UNITS, 0)).toBe(true);     // sign-agnostic
    expect(isMaterialVariance(1, 1)).toBe(false);                  // small both ways
    expect(isMaterialVariance(0, 999)).toBe(false);                // no variance
  });

  it('buildSummary flags material discrepancies that have no reason, and clears when a reason is set', () => {
    const products = [
      { id: 'a', name: 'Whisky', cost: 15, qty: 10 },  // big £ swing
      { id: 'b', name: 'Mints', cost: 0.2, qty: 10 },  // tiny swing
    ];
    const session = { counts: { a: 8, b: 9 }, expected: { a: 10, b: 10 }, reasons: {} };
    const s = buildSummary(session, products);

    const la = s.discrepancies.find((l) => l.productId === 'a');
    const lb = s.discrepancies.find((l) => l.productId === 'b');
    expect(la.material).toBe(true);   // -2 × £15 = £30 ≥ threshold
    expect(lb.material).toBe(false);  // -1 × £0.20
    expect(s.materialWithoutReason).toEqual(['a']);

    const withReason = buildSummary({ ...session, reasons: { a: 'breakage' } }, products);
    expect(withReason.materialWithoutReason).toEqual([]);
  });
});
