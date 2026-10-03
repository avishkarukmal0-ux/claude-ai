import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import {
  writeJSON, setActiveWorkspace, LOCAL_WORKSPACE, __resetMemForTest,
} from '../storage';
import { monthlyOutcomes } from '../outcomes';
import MonthlyOutcomesView from '../../components/outcomes/MonthlyOutcomesView';
import StocktakeView from '../../components/stocktake/StocktakeView';

// Regression for the two verified crash flows (review of f321872):
//   Scan → Count stock        → "Cannot read properties of null (reading 'length')"
//   More → This month         → "Cannot read properties of null (reading 'filter')"
// Root cause: stocktake history loaded as `null` (readJSON default-param turned an explicit
// `undefined` fallback into `null`), which then flowed into both screens.

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace(LOCAL_WORKSPACE);
  cleanup();
});

function seedPopulated() {
  writeJSON('inventory_v1', [
    { id: 'p1', name: 'Milk 2L', qty: 5, cost: 1.1, price: 1.5, barcode: '111', countedAt: Date.now() },
  ]);
  writeJSON('stocktake_history_v1', [
    { id: 'h1', finishedAt: Date.now(), itemsCounted: 1, discrepancyCount: 0, shrinkageValue: 0 },
  ]);
  writeJSON('claims_v1', [
    { id: 'c1', status: 'settled', receivedAmount: 12.5, history: [{ status: 'settled', at: Date.now() }] },
  ]);
}

describe('Phase 1 — crash flows: empty workspace', () => {
  it('More → This month renders an empty state, no throw', () => {
    const { container } = render(<MonthlyOutcomesView onBack={() => {}} />);
    expect(container.textContent).toContain('This month');
    expect(container.textContent).toContain('Nothing recorded yet');
  });

  it('Scan → Count stock renders an empty state, no throw', () => {
    const { container } = render(<StocktakeView onBack={() => {}} />);
    expect(container.textContent).toContain('Stocktake');
    expect(container.textContent).toContain('Add stock first');
  });
});

describe('Phase 1 — crash flows: populated workspace', () => {
  it('This month shows real figures (credit received)', () => {
    seedPopulated();
    const { container } = render(<MonthlyOutcomesView onBack={() => {}} />);
    expect(container.textContent).toContain('Credit received');
    expect(container.textContent).toContain('£12.50');
    expect(container.textContent).not.toContain('Nothing recorded yet');
  });

  it('Count stock offers a count + shows past counts', () => {
    seedPopulated();
    const { container } = render(<StocktakeView onBack={() => {}} />);
    expect(container.textContent).toContain('Start a count');
    expect(container.textContent).toContain('Past counts');
  });
});

describe('Phase 1 — crash flows: restored workspace', () => {
  it('renders data that was just written (simulating a backup restore)', () => {
    // A restore writes store keys then the screen reads them — same path as populated.
    writeJSON('stocktake_history_v1', [
      { id: 'h2', finishedAt: Date.now(), itemsCounted: 3, discrepancyCount: 1, shrinkageValue: 4 },
    ]);
    writeJSON('inventory_v1', [{ id: 'p9', name: 'Beans', qty: 2, cost: 0.5, price: 0.9 }]);
    const { container } = render(<StocktakeView onBack={() => {}} />);
    expect(container.textContent).toContain('Past counts');
  });
});

describe('Phase 1 — crash flows: account-switched workspace', () => {
  it('a different shop sees its own (empty) data, no bleed, no throw', () => {
    setActiveWorkspace('shop:A');
    seedPopulated();
    // Switch to a different shop account — must read empty, not shop:A's data.
    setActiveWorkspace('shop:B');
    const out = render(<MonthlyOutcomesView onBack={() => {}} />);
    expect(out.container.textContent).toContain('Nothing recorded yet');
    cleanup();
    const st = render(<StocktakeView onBack={() => {}} />);
    expect(st.container.textContent).toContain('Add stock first');
  });
});

describe('Phase 1 — monthlyOutcomes null-robustness (defence in depth)', () => {
  it('does not throw when array inputs are explicitly null', () => {
    const o = monthlyOutcomes({ claims: null, tasks: null, products: null, stocktakeHistory: null });
    expect(o.creditReceived).toBe(0);
    expect(o.discrepanciesResolved).toBe(0);
    expect(o.coverageTotal).toBe(0);
  });
});
