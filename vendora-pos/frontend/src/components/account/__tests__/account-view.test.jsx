import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AccountView from '../AccountView';
import * as account from '../../../lib/account';
import {
  setActiveWorkspace, writeJSON, readJSON, shopWorkspace, LOCAL_WORKSPACE, __resetMemForTest,
} from '../../../lib/storage';

function transport(overrides = {}) {
  return async (path, body) => {
    if (overrides[path]) return overrides[path](body);
    if (path === '/register') return { token: 't', refreshToken: 'r', shop: { id: 'shopA', name: body.shopName } };
    if (path === '/login') return { token: 't', refreshToken: 'r', shop: { id: 'shopA', name: 'A' } };
    return {};
  };
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  account.__setTransport(transport());
  setActiveWorkspace(LOCAL_WORKSPACE);
});
afterEach(() => { account.__setTransport(null); });

describe('AccountView', () => {
  it('register with on-device data → offers migration → moves it into the shop and calls onDone', async () => {
    // guest data exists before signing up
    writeJSON('inventory_v1', [{ id: 'guest' }]);
    const onDone = vi.fn();
    render(<AccountView onDone={onDone} />);

    fireEvent.click(screen.getByTestId('tab-register'));
    fireEvent.change(screen.getByPlaceholderText(/shop name/i), { target: { value: 'My Shop' } });
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'o@x.com' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'pw123456' } });
    fireEvent.click(screen.getByTestId('submit'));

    // migration prompt appears
    const moveBtn = await screen.findByRole('button', { name: /move my data into my shop/i });
    fireEvent.click(moveBtn);

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(readJSON('inventory_v1', [], shopWorkspace('shopA'))).toEqual([{ id: 'guest' }]);
  });

  it('shows an error on bad credentials and does not sign in', async () => {
    account.__setTransport(transport({ '/login': () => { const e = new Error('no'); e.status = 401; throw e; } }));
    render(<AccountView onDone={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'o@x.com' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByTestId('submit'));

    expect(await screen.findByText(/not recognised/i)).toBeTruthy();
    expect(account.isLoggedIn()).toBe(false);
  });

  it('no on-device data → signs in and calls onDone without a migration step', async () => {
    const onDone = vi.fn();
    render(<AccountView onDone={onDone} />);
    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'o@x.com' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'pw123456' } });
    fireEvent.click(screen.getByTestId('submit'));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(screen.queryByText(/move my data into my shop/i)).toBeNull();
  });
});
