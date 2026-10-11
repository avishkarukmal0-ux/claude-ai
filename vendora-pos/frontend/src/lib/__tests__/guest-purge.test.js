import { describe, it, expect, beforeEach } from 'vitest';
import { writeJSON, workspaceHasData, shopWorkspace, LOCAL_WORKSPACE, __resetMemForTest } from '../storage';
import { purgeStaleGuestData } from '../account';

const AUTH_KEY = 'vendora:auth';
const signIn = (id) => localStorage.setItem(AUTH_KEY, JSON.stringify({ token: 't', shop: { id }, role: 'owner' }));
const signOut = () => localStorage.removeItem(AUTH_KEY);
const seedGuest = () => writeJSON('inventory_v1', [{ id: 'g1', name: 'guest stock' }], LOCAL_WORKSPACE);
const seedShop = (id) => writeJSON('inventory_v1', [{ id: 's1', name: 'shop stock' }], shopWorkspace(id));

describe('purgeStaleGuestData — keeps the pre-login space free of real data, safely (2026-10-11)', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } __resetMemForTest(); });

  it('accounts disabled → never wipes (guest IS the only data with no auth)', () => {
    seedGuest(); signIn('shopA'); seedShop('shopA');
    expect(purgeStaleGuestData({ enabled: false })).toBe(false);
    expect(workspaceHasData(LOCAL_WORKSPACE)).toBe(true);
  });

  it('signed out → keeps guest data (nothing to purge against yet)', () => {
    seedGuest(); signOut();
    expect(purgeStaleGuestData({ enabled: true })).toBe(false);
    expect(workspaceHasData(LOCAL_WORKSPACE)).toBe(true);
  });

  it('fresh account (shop has no data yet) → keeps guest so it can still be migrated', () => {
    seedGuest(); signIn('shopNew'); // shop workspace empty
    expect(purgeStaleGuestData({ enabled: true })).toBe(false);
    expect(workspaceHasData(LOCAL_WORKSPACE)).toBe(true);
  });

  it('established, signed-in shop → wipes the leftover guest data', () => {
    seedGuest(); signIn('shopA'); seedShop('shopA');
    expect(purgeStaleGuestData({ enabled: true })).toBe(true);
    expect(workspaceHasData(LOCAL_WORKSPACE)).toBe(false);   // guest/welcome space now clean
    expect(workspaceHasData(shopWorkspace('shopA'))).toBe(true); // the shop's own data is untouched
  });

  it('no guest data → no-op (idempotent)', () => {
    signIn('shopA'); seedShop('shopA');
    expect(purgeStaleGuestData({ enabled: true })).toBe(false);
  });
});
