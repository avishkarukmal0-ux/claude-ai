import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RequireShopLogin from '../RequireShopLogin';

const AUTH_KEY = 'vendora:auth';
const App = ({ enabled }) => (
  <MemoryRouter initialEntries={['/home']}>
    <Routes>
      <Route path="/home" element={<RequireShopLogin enabled={enabled}><div>SHOP APP</div></RequireShopLogin>} />
      <Route path="/account" element={<div>LOGIN SCREEN</div>} />
    </Routes>
  </MemoryRouter>
);

describe('RequireShopLogin — isolation starts at login (2026-10-11)', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

  it('accounts enabled + signed out → redirects to the login screen (no app/data shown)', () => {
    const { queryByText } = render(<App enabled />);
    expect(queryByText('SHOP APP')).toBeNull();
    expect(queryByText('LOGIN SCREEN')).toBeTruthy();
  });

  it('accounts enabled + signed in → shows the app', () => {
    localStorage.setItem(AUTH_KEY, JSON.stringify({ token: 't1', shop: { id: 'shopA' }, role: 'owner' }));
    const { queryByText } = render(<App enabled />);
    expect(queryByText('SHOP APP')).toBeTruthy();
    expect(queryByText('LOGIN SCREEN')).toBeNull();
  });

  it('accounts disabled → never locks out (app shown even when signed out)', () => {
    const { queryByText } = render(<App enabled={false} />);
    expect(queryByText('SHOP APP')).toBeTruthy();
  });
});
