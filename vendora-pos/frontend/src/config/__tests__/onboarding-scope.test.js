import { describe, it, expect, beforeEach } from 'vitest';
import { setActiveWorkspace, __resetMemForTest } from '../../lib/storage';
import { getQuickToolsForShop } from '../quickTools';
import { saveShopType } from '../shopTypes';
import { getBusinessProfile, saveBusinessProfile } from '../../lib/businessProfile';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace('shop:onboarding');
});

const toolIds = (shop) => getQuickToolsForShop(shop).map((t) => t.id);

describe('onboarding answers scoped to the shop type', () => {
  it('Pet shop with sells-animals=yes shows Animal licence + Vet medicines', () => {
    const profile = { sellsAnimals: true };
    const ids = toolIds({ familyId: 'mobile-value', memberId: 'pet-shop', profile });
    expect(ids).toContain('animal-licence');
    expect(ids).toContain('vet-meds');
  });

  it('Discount/Pound never shows pet tools, even if sells-animals is still true', () => {
    const profile = { sellsAnimals: true };
    const ids = toolIds({ familyId: 'mobile-value', memberId: 'discount-pound', profile });
    expect(ids).not.toContain('animal-licence');
    expect(ids).not.toContain('vet-meds');
  });

  it('changing FAMILY clears the niche answers (so stale Yes cannot leak)', () => {
    saveBusinessProfile({ sellsAnimals: true, importsFood: true, festivalsOn: true });
    saveShopType('mobile-value', 'pet-shop');     // first save, no prior family → nothing cleared
    expect(getBusinessProfile().sellsAnimals).toBe(true);
    saveShopType('grocery-age', 'convenience');   // family changed → niche answers reset
    const p = getBusinessProfile();
    expect(p.sellsAnimals).toBeNull();
    expect(p.importsFood).toBeNull();
    expect(p.festivalsOn).toBeNull();
  });

  it('switching MEMBER within a family keeps the answers (no accidental wipe)', () => {
    saveShopType('mobile-value', 'pet-shop');
    saveBusinessProfile({ sellsAnimals: true });
    saveShopType('mobile-value', 'discount-pound'); // same family → not cleared
    expect(getBusinessProfile().sellsAnimals).toBe(true);
  });
});
