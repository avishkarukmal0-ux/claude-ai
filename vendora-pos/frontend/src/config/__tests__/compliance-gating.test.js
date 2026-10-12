import { describe, it, expect } from 'vitest';
import { getQuickToolsForShop } from '../quickTools';
import { complianceForFamily, COMPLIANCE_ITEMS } from '../compliance';

const idsFor = (shop, now) => getQuickToolsForShop(shop, now).map((t) => t.id);
const NOW = new Date('2026-10-12');

describe('quick-tool gating — member + business profile', () => {
  it('off-licence hides Vape duty; vape & CBD hides MUP', () => {
    const off = idsFor({ familyId: 'grocery-age', memberId: 'off-licence' }, NOW);
    expect(off).not.toContain('vpd');
    expect(off).toContain('mup'); // off-licence still gets MUP (region unknown → shown)

    const vape = idsFor({ familyId: 'grocery-age', memberId: 'vape-cbd' }, NOW);
    expect(vape).not.toContain('mup');
    expect(vape).toContain('vpd');
  });

  it('MUP is hidden in England/NI and shown in Scotland/Wales', () => {
    const eng = idsFor({ familyId: 'grocery-age', memberId: 'off-licence', profile: { region: 'england' } }, NOW);
    expect(eng).not.toContain('mup');
    const sco = idsFor({ familyId: 'grocery-age', memberId: 'off-licence', profile: { region: 'scotland' } }, NOW);
    expect(sco).toContain('mup');
  });

  it('MTD countdown only shows for a qualifying sole trader', () => {
    expect(idsFor({ familyId: 'grocery-age' }, NOW)).not.toContain('mtd-countdown'); // no profile
    expect(idsFor({ familyId: 'grocery-age', profile: { entity: 'ltd', turnoverBand: 'over-50k' } }, NOW)).not.toContain('mtd-countdown');
    expect(idsFor({ familyId: 'grocery-age', profile: { entity: 'sole-trader', turnoverBand: 'over-50k' } }, NOW)).toContain('mtd-countdown');
  });

  it('Fresh group gets PPDS label + temperature log + weigh & label + registration; grocery does not', () => {
    const fresh = idsFor({ familyId: 'fresh-weighed' }, NOW);
    expect(fresh).toEqual(expect.arrayContaining(['ppds-label', 'temp-log', 'weigh-label', 'food-registration']));
    const grocery = idsFor({ familyId: 'grocery-age' }, NOW);
    expect(grocery).not.toContain('ppds-label');
    expect(grocery).not.toContain('temp-log');
    expect(grocery).not.toContain('weigh-label');
  });

  it('weigh & label is fresh-weighed only; registration reaches world-specialist too', () => {
    expect(idsFor({ familyId: 'world-specialist' }, NOW)).not.toContain('weigh-label');
    expect(idsFor({ familyId: 'world-specialist' }, NOW)).toContain('food-registration');
  });

  it('age-restricted shops get the refusals log and vape product check', () => {
    const g = idsFor({ familyId: 'grocery-age' }, NOW);
    expect(g).toContain('refusals-log');
    expect(g).toContain('vape-check');
  });
});

describe('complianceForFamily — MTD gating + new vape items + sources', () => {
  it('hides MTD quarterly update unless MTD applies', () => {
    const none = complianceForFamily('grocery-age', NOW, null);
    expect(none.upcoming.find((c) => c.id === 'mtd-q')).toBeUndefined();
    const on = complianceForFamily('grocery-age', NOW, { entity: 'sole-trader', turnoverBand: 'over-50k' });
    expect(on.upcoming.find((c) => c.id === 'mtd-q')).toBeTruthy();
  });

  it('includes the disposable-vape ban (ongoing) and the duty-stamp date for grocery-age', () => {
    const g = complianceForFamily('grocery-age', NOW, null);
    expect(g.ongoing.find((c) => c.id === 'disposable-ban')).toBeTruthy();
    expect(g.upcoming.find((c) => c.id === 'vape-stamp')).toBeTruthy();
  });

  it('every compliance item carries the required data fields (ground rule 2)', () => {
    for (const c of COMPLIANCE_ITEMS) {
      expect(typeof c.sourceUrl).toBe('string');
      expect(c.sourceUrl).toMatch(/^https?:\/\//);
      expect(['verified', 'reported']).toContain(c.confidence);
      expect(c.lastVerified).toBe('2026-10-12');
      expect(Array.isArray(c.nations)).toBe(true);
      expect(typeof c.text).toBe('string');
    }
  });

  it('nation-gates MUP: hidden in England, shown in Scotland', () => {
    const eng = complianceForFamily('grocery-age', NOW, { region: 'england' });
    expect([...eng.upcoming, ...eng.ongoing].find((c) => c.id === 'mup')).toBeUndefined();
    const sco = complianceForFamily('grocery-age', NOW, { region: 'scotland' });
    expect(sco.ongoing.find((c) => c.id === 'mup')).toBeTruthy();
  });
});
