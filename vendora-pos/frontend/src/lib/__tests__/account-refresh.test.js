import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as account from '../account';

// Guards the fix for the audit finding: a pending token refresh must not resurrect a logged-out session
// or cross-contaminate a newly logged-in one.
const AUTH = 'vendora:auth';
beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });
afterEach(() => account.__setTransport(null));

describe('account.refresh — session identity', () => {
  it('does not resurrect a session that logged out mid-refresh', async () => {
    localStorage.setItem(AUTH, JSON.stringify({ token: 't', refreshToken: 'r', shop: { id: 's', name: 'S' } }));
    account.__setTransport(async () => { localStorage.removeItem(AUTH); return { token: 'fresh' }; }); // logout happens during the request
    await expect(account.refresh()).rejects.toThrow();
    expect(localStorage.getItem(AUTH)).toBeNull(); // stayed logged out
  });

  it('does not overwrite a different account that logged in mid-refresh', async () => {
    localStorage.setItem(AUTH, JSON.stringify({ token: 'tA', refreshToken: 'rA', shop: { id: 'A', name: 'A' } }));
    account.__setTransport(async () => {
      localStorage.setItem(AUTH, JSON.stringify({ token: 'tB', refreshToken: 'rB', shop: { id: 'B', name: 'B' } }));
      return { token: 'freshA' };
    });
    await expect(account.refresh()).rejects.toThrow();
    const cur = JSON.parse(localStorage.getItem(AUTH));
    expect(cur.shop.id).toBe('B');     // B's session intact
    expect(cur.token).toBe('tB');      // not replaced by A's fresh token
  });

  it('refreshes normally when the session is unchanged', async () => {
    localStorage.setItem(AUTH, JSON.stringify({ token: 'old', refreshToken: 'r', shop: { id: 's', name: 'S' } }));
    account.__setTransport(async () => ({ token: 'new' }));
    const next = await account.refresh();
    expect(next.token).toBe('new');
    expect(JSON.parse(localStorage.getItem(AUTH)).token).toBe('new');
  });
});
