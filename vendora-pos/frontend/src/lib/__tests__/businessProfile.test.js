import { describe, it, expect, beforeEach } from 'vitest';
import { setActiveWorkspace, __resetMemForTest } from '../storage';
import {
  getBusinessProfile, saveBusinessProfile, mtdApplies, mtdReason,
  MTD_30K_FROM,
} from '../businessProfile';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace('shop:mtd');
});

describe('businessProfile — persistence + normalisation', () => {
  it('round-trips a valid profile and drops unknown values', () => {
    saveBusinessProfile({ entity: 'sole-trader', turnoverBand: 'over-50k', region: 'scotland' });
    expect(getBusinessProfile()).toEqual({ entity: 'sole-trader', turnoverBand: 'over-50k', region: 'scotland' });
    saveBusinessProfile({ entity: 'nonsense', region: 'mars' });
    const p = getBusinessProfile();
    expect(p.entity).toBeNull();        // invalid cleared
    expect(p.region).toBeNull();
    expect(p.turnoverBand).toBe('over-50k'); // untouched field kept
  });
});

describe('mtdApplies — MTD for Income Tax gating', () => {
  const now2026 = new Date('2026-10-12');
  it('never applies to a limited company', () => {
    expect(mtdApplies({ entity: 'ltd', turnoverBand: 'over-50k' }, now2026)).toBe(false);
  });
  it('applies to a sole trader over £50k in 2026-27', () => {
    expect(mtdApplies({ entity: 'sole-trader', turnoverBand: 'over-50k' }, now2026)).toBe(true);
  });
  it('does NOT yet apply to a £30k–50k sole trader before 6 Apr 2027, but does after', () => {
    const before = new Date(MTD_30K_FROM - 86400000);
    const after = new Date(MTD_30K_FROM + 86400000);
    expect(mtdApplies({ entity: 'sole-trader', turnoverBand: '30k-50k' }, before)).toBe(false);
    expect(mtdApplies({ entity: 'sole-trader', turnoverBand: '30k-50k' }, after)).toBe(true);
  });
  it('does not apply under £30k or when unknown', () => {
    expect(mtdApplies({ entity: 'sole-trader', turnoverBand: 'under-30k' }, now2026)).toBe(false);
    expect(mtdApplies(null, now2026)).toBe(false);
    expect(mtdApplies({ entity: 'sole-trader' }, now2026)).toBe(false);
  });
  it('explains why when it does not apply', () => {
    expect(mtdReason({ entity: 'ltd' })).toMatch(/Corporation Tax/i);
    expect(mtdReason(null)).toMatch(/tax details/i);
  });
});
