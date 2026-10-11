import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import TodayActions from '../TodayActions';
import { writeJSON, setActiveWorkspace, __resetMemForTest } from '../../../lib/storage';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace('shop:today');
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// "Do this today" is the home screen's most important list. It was rendering each <li> WITHOUT a key, which
// triggers React's list-key warning and risks mis-reconciliation when rows are snoozed. Regression: render it
// with two independent actions and assert no key warning + both rows present.
describe('TodayActions — list keys (home screen)', () => {
  it('renders multiple actions without a React key warning', () => {
    const pastUseBy = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
    writeJSON('inventory_v1', [
      { id: 'p1', name: 'Old Yoghurt', qty: 2, cost: 0.5, price: 1, expiry: pastUseBy, dateType: 'use-by' }, // → pull (critical)
      { id: 'p2', name: 'Cola 330ml', qty: 1, min: 5, cost: 0.3, price: 0.9 },                                // → low (info)
    ]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getAllByLabelText } = render(<TodayActions onGo={() => {}} />);

    // Both action rows present (each has a "Snooze until tomorrow" control).
    expect(getAllByLabelText('Snooze until tomorrow').length).toBeGreaterThanOrEqual(2);
    // No "unique key" warning was logged.
    const keyWarning = errSpy.mock.calls.some((args) => args.some((a) => typeof a === 'string' && a.includes('unique "key" prop')));
    expect(keyWarning).toBe(false);
  });
});
