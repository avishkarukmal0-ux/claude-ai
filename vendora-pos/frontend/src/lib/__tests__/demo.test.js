import { describe, it, expect, beforeEach } from 'vitest';
import { loadDemo, exitDemo, isDemoActive, DEMO_WORKSPACE, ensureSignedOutSampleMode } from '../demo';
import { canInstall, isStandalone, isIOS, installDismissed } from '../install';
import {
  setActiveWorkspace, getActiveWorkspace, writeJSON, readJSON, LOCAL_WORKSPACE, __resetMemForTest,
} from '../storage';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace(LOCAL_WORKSPACE);
});

describe('demo data (Phase 2.6c) — isolated, never mixed with real data', () => {
  it('loadDemo seeds its own workspace and switches to it, leaving real data untouched', () => {
    writeJSON('inventory_v1', [{ id: 'real-item' }], LOCAL_WORKSPACE); // the real guest shop
    loadDemo();
    expect(isDemoActive()).toBe(true);
    expect(getActiveWorkspace()).toBe(DEMO_WORKSPACE);
    expect(readJSON('inventory_v1', [], DEMO_WORKSPACE).length).toBeGreaterThan(0); // sample catalogue
    expect(readJSON('inventory_v1', [], LOCAL_WORKSPACE)).toEqual([{ id: 'real-item' }]); // real data intact
  });

  it('exitDemo purges the demo workspace and returns to the real guest workspace', () => {
    writeJSON('inventory_v1', [{ id: 'real-item' }], LOCAL_WORKSPACE);
    loadDemo();
    exitDemo();
    expect(isDemoActive()).toBe(false);
    expect(getActiveWorkspace()).toBe(LOCAL_WORKSPACE);
    expect(readJSON('inventory_v1', null, DEMO_WORKSPACE)).toBeNull();     // demo wiped
    expect(readJSON('inventory_v1', [], LOCAL_WORKSPACE)).toEqual([{ id: 'real-item' }]); // real data still there
  });

  it('exitDemo restores the workspace the owner was in before the demo (not the guest picker)', () => {
    setActiveWorkspace('shop:abc123');   // a signed-in owner's shop workspace
    loadDemo();
    expect(getActiveWorkspace()).toBe(DEMO_WORKSPACE);
    exitDemo();
    expect(isDemoActive()).toBe(false);
    expect(getActiveWorkspace()).toBe('shop:abc123'); // back to their shop, not 'local'
  });
});

describe('ensureSignedOutSampleMode — signed-out welcome shows SAMPLE data, never real data', () => {
  it('signed out + accounts on → switches to demo (sample) so no real data is shown', () => {
    writeJSON('inventory_v1', [{ id: 'real-guest-item' }], LOCAL_WORKSPACE); // "real" data in the guest space
    const switched = ensureSignedOutSampleMode({ loggedIn: false, accountsEnabled: true });
    expect(switched).toBe(true);
    expect(isDemoActive()).toBe(true);                                      // now on sample data
    expect(readJSON('inventory_v1', [], DEMO_WORKSPACE).length).toBeGreaterThan(0);
    expect(readJSON('inventory_v1', [], LOCAL_WORKSPACE)).toEqual([{ id: 'real-guest-item' }]); // real data untouched, just not active
  });

  it('signed in → never forces demo (the shop sees its real data)', () => {
    const switched = ensureSignedOutSampleMode({ loggedIn: true, accountsEnabled: true });
    expect(switched).toBe(false);
    expect(isDemoActive()).toBe(false);
    expect(getActiveWorkspace()).toBe(LOCAL_WORKSPACE);
  });

  it('accounts disabled → no-op (nothing to log into; single local workspace)', () => {
    const switched = ensureSignedOutSampleMode({ loggedIn: false, accountsEnabled: false });
    expect(switched).toBe(false);
    expect(isDemoActive()).toBe(false);
  });

  it('already in demo → no-op (idempotent)', () => {
    loadDemo();
    const switched = ensureSignedOutSampleMode({ loggedIn: false, accountsEnabled: true });
    expect(switched).toBe(false);
    expect(isDemoActive()).toBe(true);
  });
});

describe('install guidance (Phase 2.6d) — safe defaults', () => {
  it('reports boolean capabilities and nothing installable without a browser event', () => {
    expect(canInstall()).toBe(false);
    expect(typeof isStandalone()).toBe('boolean');
    expect(typeof isIOS()).toBe('boolean');
    expect(typeof installDismissed()).toBe('boolean');
  });
});
