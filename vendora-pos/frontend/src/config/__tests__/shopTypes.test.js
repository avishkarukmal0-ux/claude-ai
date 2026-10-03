import { describe, it, expect, beforeEach } from 'vitest';
import { getFamily, getMember, getSavedShopType, saveShopType, SHOP_FAMILIES } from '../shopTypes';
import { setActiveWorkspace } from '../../lib/storage';

let n = 0;
beforeEach(() => { setActiveWorkspace(`shop:st${n++}`); });

describe('shopTypes — newsagent merged into convenience', () => {
  it('newsagent is no longer a selectable member of grocery-age', () => {
    const fam = getFamily('grocery-age');
    expect(fam.members.some((m) => m.id === 'newsagent')).toBe(false);
    expect(fam.members.some((m) => m.id === 'convenience')).toBe(true);
  });

  it('a shop already set to newsagent resolves to convenience (no stranded data)', () => {
    saveShopType('grocery-age', 'newsagent');
    const saved = getSavedShopType();
    expect(saved.familyId).toBe('grocery-age');
    expect(saved.memberId).toBe('convenience');           // aliased
    expect(getMember('grocery-age', 'newsagent').id).toBe('convenience'); // still resolves to a real member
  });

  it('normal shop types are unaffected', () => {
    saveShopType('grocery-age', 'off-licence');
    expect(getSavedShopType().memberId).toBe('off-licence');
    expect(getMember('grocery-age', 'off-licence').label).toMatch(/off-licence/i);
  });

  it('unknown family still returns null', () => {
    saveShopType('does-not-exist', 'whatever');
    expect(getSavedShopType()).toBeNull();
  });
});
