import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '../HomePage';
import { setActiveWorkspace, __resetMemForTest, write } from '../../lib/storage';

// The bottom nav is now URL-driven (?tab=) so the Back button moves between tabs and each tab is a real link.
// This verifies the URL → active-tab wiring (the behaviour Back relies on); the physical Back press + 375px
// layout are browser checks.
beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace('shop:hometab');
  write('shop_type', 'grocery-age', 'shop:hometab'); // a valid FAMILY id; HomePage redirects to "/" otherwise
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const renderAt = (url) => render(<MemoryRouter initialEntries={[url]}><HomePage /></MemoryRouter>);

describe('HomePage — URL drives the active tab', () => {
  it('/home?tab=stock opens the Stock tab (Inventory)', () => {
    const { container } = renderAt('/home?tab=stock');
    expect(container.textContent).toContain('Inventory');
    // aria-current marks exactly one nav link as the current page.
    expect(container.querySelectorAll('[aria-current="page"]').length).toBe(1);
  });

  it('/home?tab=buy opens the Buy tab with the collapse affordance', () => {
    const { container } = renderAt('/home?tab=buy');
    expect(container.textContent).toContain('Buy & suppliers');
    expect(container.textContent).toContain('All buying tools'); // long tail collapsed behind this
  });

  it('nav items are anchors (links), not buttons', () => {
    const { getByText } = renderAt('/home?tab=today');
    const stock = getByText('Stock').closest('a');
    expect(stock).toBeTruthy();
    expect(stock.getAttribute('href')).toContain('tab=stock');
  });
});
