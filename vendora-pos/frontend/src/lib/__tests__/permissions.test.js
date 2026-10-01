import { describe, it, expect } from 'vitest';
import {
  canWriteStore, canSeeScreen, can, roleLabel, MONEY_SCREENS, FINANCIAL_STORES,
} from '../permissions';

describe('permissions — role gating (client mirror of the backend)', () => {
  it('staff cannot write financial stores but can write operational ones', () => {
    expect(canWriteStore('staff', 'takings_v1')).toBe(false);
    expect(canWriteStore('staff', 'claims_v1')).toBe(false);
    expect(canWriteStore('staff', 'inventory_v1')).toBe(true);
    expect(canWriteStore('staff', 'deliveries_v1')).toBe(true);
  });

  it('manager and owner can write everything', () => {
    for (const s of [...FINANCIAL_STORES, 'inventory_v1']) {
      expect(canWriteStore('manager', s)).toBe(true);
      expect(canWriteStore('owner', s)).toBe(true);
    }
  });

  it('unknown/guest role is treated as owner', () => {
    expect(canWriteStore(undefined, 'takings_v1')).toBe(true);
    expect(canSeeScreen(null, 'claims')).toBe(true);
  });

  it('staff cannot see money screens or staff-admin, but can see operational screens', () => {
    for (const s of MONEY_SCREENS) expect(canSeeScreen('staff', s)).toBe(false);
    expect(canSeeScreen('staff', 'staff-admin')).toBe(false);
    expect(canSeeScreen('staff', 'receive')).toBe(true);
    expect(canSeeScreen('staff', 'stocktake')).toBe(true);
  });

  it('managers see money screens but not staff-admin', () => {
    expect(canSeeScreen('manager', 'claims')).toBe(true);
    expect(canSeeScreen('manager', 'weekly-report')).toBe(true);
    expect(canSeeScreen('manager', 'staff-admin')).toBe(false);
  });

  it('only the owner can manage staff', () => {
    expect(can('owner', 'manageStaff')).toBe(true);
    expect(can('manager', 'manageStaff')).toBe(false);
    expect(can('staff', 'manageStaff')).toBe(false);
  });

  it('money capability covers owner + manager', () => {
    expect(can('owner', 'money')).toBe(true);
    expect(can('manager', 'money')).toBe(true);
    expect(can('staff', 'money')).toBe(false);
  });

  it('roleLabel is human-readable', () => {
    expect(roleLabel('owner')).toBe('Owner');
    expect(roleLabel('manager')).toBe('Manager');
    expect(roleLabel('staff')).toBe('Staff');
    expect(roleLabel('weird')).toBe('Owner');
  });
});
