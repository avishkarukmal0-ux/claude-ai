import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as account from '../account';
import {
  setActiveWorkspace, getActiveWorkspace, shopWorkspace, writeJSON, readJSON, LOCAL_WORKSPACE,
  __resetMemForTest,
} from '../storage';

// A fake backend transport so the auth/session logic is testable without a server.
function makeTransport(overrides = {}) {
  const calls = [];
  const transport = async (path, body) => {
    calls.push({ path, body });
    if (overrides[path]) return overrides[path](body);
    if (path === '/register') return { token: 't1', refreshToken: 'r1', shop: { id: 'shopA', name: body.shopName } };
    if (path === '/login') return { token: 't1', refreshToken: 'r1', shop: { id: 'shopA', name: 'A' } };
    if (path === '/refresh') return { token: 't2' };
    return {};
  };
  transport.calls = calls;
  return transport;
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  account.__setTransport(makeTransport());
  setActiveWorkspace(LOCAL_WORKSPACE);
});
afterEach(() => { account.__setTransport(null); });

describe('account — login/register session', () => {
  it('register persists a session and switches the active workspace to the shop', async () => {
    await account.register({ email: 'o@x.com', password: 'pw', shopName: 'My Shop' });
    expect(account.isLoggedIn()).toBe(true);
    expect(account.currentShop()).toEqual({ id: 'shopA', name: 'My Shop' });
    expect(getActiveWorkspace()).toBe(shopWorkspace('shopA'));
  });

  it('login stores token + shop and refresh updates only the access token', async () => {
    await account.login({ email: 'o@x.com', password: 'pw' });
    expect(account.currentSession().token).toBe('t1');
    const next = await account.refresh();
    expect(next.token).toBe('t2');
    expect(next.refreshToken).toBe('r1');           // unchanged
    expect(account.currentShop().id).toBe('shopA');  // session preserved
  });

  it('a failed login throws and leaves no session', async () => {
    account.__setTransport(makeTransport({
      '/login': () => { const e = new Error('bad creds'); e.status = 401; throw e; },
    }));
    await expect(account.login({ email: 'o@x.com', password: 'nope' })).rejects.toThrow(/bad creds/);
    expect(account.isLoggedIn()).toBe(false);
  });

  it('logout purges this device’s shop cache by default (shared-device safety)', async () => {
    await account.login({ email: 'o@x.com', password: 'pw' });
    writeJSON('inventory_v1', [{ id: 'secret' }]); // data in the shop workspace
    account.logout();
    expect(account.isLoggedIn()).toBe(false);
    expect(getActiveWorkspace()).toBe(LOCAL_WORKSPACE);
    // shop data is gone from THIS device (it stays in the cloud and re-pulls on next sign-in)
    expect(readJSON('inventory_v1', null, shopWorkspace('shopA'))).toBeNull();
  });

  it('logout({ purge: false }) keeps the shop cache on this (personal) device', async () => {
    await account.login({ email: 'o@x.com', password: 'pw' });
    writeJSON('inventory_v1', [{ id: 'keep' }]);
    account.logout({ purge: false });
    expect(account.isLoggedIn()).toBe(false);
    expect(readJSON('inventory_v1', [], shopWorkspace('shopA'))).toEqual([{ id: 'keep' }]);
  });

  it('switching to a different shop purges the previous shop’s cache (device handover)', async () => {
    await account.login({ email: 'a@x.com', password: 'pw' }); // shopA
    writeJSON('inventory_v1', [{ id: 'A-only' }]);
    // Now a different account signs in on the same device.
    account.__setTransport(makeTransport({
      '/login': () => ({ token: 't9', refreshToken: 'r9', shop: { id: 'shopB', name: 'B' } }),
    }));
    await account.login({ email: 'b@x.com', password: 'pw' }); // shopB
    expect(getActiveWorkspace()).toBe(shopWorkspace('shopB'));
    // shopA's cached data must not linger on the device for shopB's user to find
    expect(readJSON('inventory_v1', null, shopWorkspace('shopA'))).toBeNull();
  });

  it('re-login as the SAME shop keeps its cache (no needless re-download)', async () => {
    await account.login({ email: 'o@x.com', password: 'pw' }); // shopA
    writeJSON('inventory_v1', [{ id: 'keep' }]);
    await account.login({ email: 'o@x.com', password: 'pw' }); // shopA again
    expect(readJSON('inventory_v1', [], shopWorkspace('shopA'))).toEqual([{ id: 'keep' }]);
  });
});

describe('account — guest → shop migration (explicit, non-destructive)', () => {
  it('offers to move guest data into an empty shop, and does so on request', async () => {
    // guest builds data before signing up
    setActiveWorkspace(LOCAL_WORKSPACE);
    writeJSON('inventory_v1', [{ id: 'guest' }]);
    writeJSON('suppliers_v1', [{ id: 's1' }]);

    await account.register({ email: 'o@x.com', password: 'pw', shopName: 'My Shop' });
    expect(account.guestDataExists()).toBe(true);
    expect(account.shopHasData()).toBe(false);

    const report = account.migrateGuestIntoShop();
    expect(report.copied).toBeGreaterThanOrEqual(2);
    expect(readJSON('inventory_v1', [], shopWorkspace('shopA'))).toEqual([{ id: 'guest' }]);
  });

  it('never overwrites data the shop already has (no silent clobber)', async () => {
    await account.login({ email: 'o@x.com', password: 'pw' }); // active = shop
    writeJSON('inventory_v1', [{ id: 'shop-own' }]);            // shop already has data
    setActiveWorkspace(LOCAL_WORKSPACE);
    writeJSON('inventory_v1', [{ id: 'guest' }]);

    const report = account.migrateGuestIntoShop('shopA');
    expect(report.skipped).toBeGreaterThanOrEqual(1);
    expect(readJSON('inventory_v1', [], shopWorkspace('shopA'))).toEqual([{ id: 'shop-own' }]); // untouched
  });
});

describe('account — logout identity guard (C1)', () => {
  it('refuses to purge when the active account changed during an awaited sign-out', async () => {
    await account.login({ email: 'a@x.com', password: 'pw' });          // shopA
    writeJSON('inventory_v1', [{ id: 'A-data' }], shopWorkspace('shopA'));
    const origin = account.currentShop().id;                            // pinned before the (awaited) sync
    // Another account signs in on this device WHILE A's sign-out awaited its final sync.
    account.__setTransport(makeTransport({ '/login': () => ({ token: 't', refreshToken: 'r', shop: { id: 'shopB', name: 'B' } }) }));
    await account.login({ email: 'b@x.com', password: 'pw' });          // session is now shopB
    writeJSON('inventory_v1', [{ id: 'B-data' }], shopWorkspace('shopB'));
    // A's stale sign-out resumes, pinned to shopA.
    const res = account.logout({ purge: true, expectShopId: origin });
    expect(res.skipped).toBe(true);
    expect(account.currentShop()).toEqual({ id: 'shopB', name: 'B' });  // B stays signed in
    expect(readJSON('inventory_v1', null, shopWorkspace('shopB'))).toEqual([{ id: 'B-data' }]); // B NOT purged
  });

  it('a normal sign-out (identity unchanged) still purges the intended workspace', async () => {
    await account.login({ email: 'a@x.com', password: 'pw' });          // shopA
    writeJSON('inventory_v1', [{ id: 'A-data' }], shopWorkspace('shopA'));
    const res = account.logout({ purge: true, expectShopId: account.currentShop().id });
    expect(res.ok).toBe(true);
    expect(account.isLoggedIn()).toBe(false);
    expect(readJSON('inventory_v1', null, shopWorkspace('shopA'))).toBeNull(); // intended workspace purged
  });
});

describe('account — password recovery + credential changes', () => {
  it('forgotPassword returns whether email delivery is configured (never throws on unknown email)', async () => {
    account.__setTransport(async () => ({ success: true, emailConfigured: true }));
    expect(await account.forgotPassword('o@x.com')).toEqual({ emailConfigured: true });
    account.__setTransport(async () => ({ success: true, emailConfigured: false }));
    expect(await account.forgotPassword('o@x.com')).toEqual({ emailConfigured: false });
  });

  it('resetPassword signs in with the returned session', async () => {
    account.__setTransport(async (path) => {
      if (path === '/reset-password') return { token: 'newT', refreshToken: 'newR', shop: { id: 'shopA', name: 'A' }, role: 'owner' };
      return {};
    });
    await account.resetPassword({ email: 'o@x.com', token: 'abc', password: 'brandnew123' });
    expect(account.isLoggedIn()).toBe(true);
    expect(account.currentSession().token).toBe('newT');
  });

  it('changePassword swaps in the re-minted tokens for the current session', async () => {
    account.__setTransport(makeTransport());
    await account.login({ email: 'o@x.com', password: 'pw' }); // token t1 / r1
    account.__setTransport(async (path, body, token) => {
      expect(token).toBe('t1'); // sends the current access token
      return { token: 'rotT', refreshToken: 'rotR' };
    });
    await account.changePassword({ currentPassword: 'pw', newPassword: 'brandnew123' });
    expect(account.currentSession().token).toBe('rotT');
    expect(account.currentSession().refreshToken).toBe('rotR');
    expect(account.currentShop().id).toBe('shopA'); // session otherwise preserved
  });

  it('changeEmail updates the stored member email', async () => {
    account.__setTransport(makeTransport());
    await account.login({ email: 'o@x.com', password: 'pw' });
    account.__setTransport(async () => ({ shop: { id: 'shopA', name: 'A' }, role: 'owner', member: { id: 'shopA', name: 'Owner', role: 'owner', email: 'renamed@x.com' } }));
    await account.changeEmail({ password: 'pw', newEmail: 'renamed@x.com' });
    expect(account.currentMember().email).toBe('renamed@x.com');
    expect(account.isLoggedIn()).toBe(true);
  });
});
