import { describe, it, expect, beforeEach } from 'vitest';
import { setActiveWorkspace, __resetMemForTest, read, readJSON, write } from '../storage';
import { loadDemo, exitDemo } from '../demo';
import { festivalsEnabled } from '../todaySignals';
import { unitPrice, priceLabel } from '../priceMarking';
import { getBusinessProfile, saveBusinessProfile } from '../businessProfile';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace('shop:niche');
});

describe('demo catalogue — each group gets its own stock (Phase 0)', () => {
  it('loads fresh-weighed stock (not bread/milk/cola) for a butcher', () => {
    write('shop_type', 'fresh-weighed:butcher');
    loadDemo();
    const names = readJSON('inventory_v1', []).map((p) => p.name).join(' | ');
    expect(names).toMatch(/Mince|Sourdough|Apples|Brie/);
    expect(names).not.toMatch(/Cola/);
    exitDemo();
  });

  it('swaps in an e-liquid for a vape & CBD shop', () => {
    write('shop_type', 'grocery-age:vape-cbd');
    loadDemo();
    const names = readJSON('inventory_v1', []).map((p) => p.name).join(' | ');
    expect(names).toMatch(/E-liquid/);
    exitDemo();
  });

  it('gives world-specialist its own supplier', () => {
    write('shop_type', 'world-specialist:ethnic-grocer');
    loadDemo();
    expect(readJSON('suppliers_v1', [])[0].name).toMatch(/Import Wholesale/);
    exitDemo();
  });
});

describe('festivalsEnabled — OFF until the owner opts in (re-audit v19)', () => {
  it('is off by default for every family and only true when opted in', () => {
    expect(festivalsEnabled('world-specialist', null)).toBe(false);
    expect(festivalsEnabled('grocery-age', null)).toBe(false);
    expect(festivalsEnabled('grocery-age', { festivalsOn: true })).toBe(true);
    expect(festivalsEnabled('world-specialist', { festivalsOn: false })).toBe(false);
  });
});

describe('businessProfile — the new onboarding answers persist (Phase 0)', () => {
  it('stores the yes/no answers as a tri-state', () => {
    saveBusinessProfile({ employees50: true, sellsAnimals: false, importsFood: true });
    const p = getBusinessProfile();
    expect(p.employees50).toBe(true);
    expect(p.sellsAnimals).toBe(false);
    expect(p.importsFood).toBe(true);
    expect(p.festivalsOn).toBeNull(); // untouched → unknown
  });
});

describe('resolveNiche — single source of truth (Phase 0 refinement)', () => {
  it('resolves tools, nudges, demo data and onboarding questions in one object', async () => {
    const { resolveNiche, onboardingQuestionsFor } = await import('../../config/niche');
    const n = resolveNiche({ familyId: 'mobile-value', memberId: 'pet-shop', profile: { region: 'england' } });
    expect(n.group).toBe('mobile-value');
    expect(Array.isArray(n.tools)).toBe(true);
    expect(Array.isArray(n.nudges)).toBe(true);
    expect(n.demoData.products.length).toBeGreaterThan(0);
    expect(n.onboardingQuestions).toContain('sellsAnimals'); // mobile-value only
    expect(onboardingQuestionsFor('fresh-weighed')).toContain('importsFood');
    expect(onboardingQuestionsFor('fresh-weighed')).not.toContain('sellsAnimals');
  });
});

describe('priceMarking — unit price (Phase 1.7)', () => {
  it('computes per-kg / per-100ml and a VAT-inclusive label', () => {
    expect(unitPrice({ price: 8.99, size: 5, sizeUnit: 'kg' }).text).toBe('£1.80/kg');
    expect(unitPrice({ price: 3.99, size: 10, sizeUnit: 'ml' }).text).toBe('£39.90/100ml');
    expect(unitPrice({ price: 1, size: 0, sizeUnit: 'kg' })).toBeNull();
    expect(priceLabel({ price: 1.2, size: 1, sizeUnit: 'kg' })).toBe('£1.20 incl. VAT · £1.20/kg');
    expect(priceLabel({ price: 0.85 })).toBe('£0.85 incl. VAT');
  });
});
