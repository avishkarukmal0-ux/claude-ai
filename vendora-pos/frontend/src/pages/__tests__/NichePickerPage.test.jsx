import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NichePickerPage from '../NichePickerPage';
import { writeJSON, LOCAL_WORKSPACE, __resetMemForTest } from '../../lib/storage';

// The welcome/landing space must NEVER show real shop data — now or in future. Even with business data sitting
// in the (guest) workspace, the picker renders only shop-type options + marketing copy, no stock/sales/figures.
describe('NichePickerPage — welcome space shows no real shop data (2026-10-11)', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } __resetMemForTest(); });

  it('does not render any business data even when the workspace holds some', () => {
    writeJSON('inventory_v1', [{ id: 'p1', name: 'SECRET STOCK ITEM' }], LOCAL_WORKSPACE);
    writeJSON('takings_v1', [{ id: 't1', total: 123456 }], LOCAL_WORKSPACE);
    const { queryByText, getByText } = render(<MemoryRouter><NichePickerPage /></MemoryRouter>);
    expect(getByText(/Welcome to Vendora/i)).toBeTruthy(); // it's the welcome screen
    expect(queryByText(/SECRET STOCK ITEM/)).toBeNull();    // no product/stock data
    expect(queryByText(/123,?456/)).toBeNull();             // no takings/figures
  });
});
