import { describe, it, expect, beforeEach } from 'vitest';
import { loadDemo, exitDemo, isDemoActive, DEMO_WORKSPACE } from '../demo';
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
});

describe('install guidance (Phase 2.6d) — safe defaults', () => {
  it('reports boolean capabilities and nothing installable without a browser event', () => {
    expect(canInstall()).toBe(false);
    expect(typeof isStandalone()).toBe('boolean');
    expect(typeof isIOS()).toBe('boolean');
    expect(typeof installDismissed()).toBe('boolean');
  });
});
