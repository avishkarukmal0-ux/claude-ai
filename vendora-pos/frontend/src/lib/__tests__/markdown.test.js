import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useMarkdowns, validateMarkdown, estimatedRecovery, markdownLabelText, markdownTotals,
} from '../markdownStore';
import { setActiveWorkspace } from '../storage';

let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:md${ws++}`); });

describe('markdownStore — validation (never sell past a hard stop)', () => {
  it('refuses a hard-stop (mustPull) markdown', () => {
    expect(validateMarkdown({ qty: 1, originalPrice: 2, reducedPrice: 1, mustPull: true }).ok).toBe(false);
  });
  it('requires a positive qty and a reduced price below the current price', () => {
    expect(validateMarkdown({ qty: 0, originalPrice: 2, reducedPrice: 1 }).ok).toBe(false);
    expect(validateMarkdown({ qty: 1, originalPrice: 2, reducedPrice: 0 }).ok).toBe(false);
    expect(validateMarkdown({ qty: 1, originalPrice: 2, reducedPrice: 2 }).ok).toBe(false); // not a reduction
    expect(validateMarkdown({ qty: 1, originalPrice: 2, reducedPrice: 1.2 }).ok).toBe(true);
  });
});

describe('markdownStore — create does not change stock, records a price action', () => {
  it('creates an active markdown with the reduced price', () => {
    const { result } = renderHook(() => useMarkdowns());
    let out;
    act(() => { out = result.current.createMarkdown({ productId: 'p1', name: 'Milk', qty: 3, originalPrice: 1.5, reducedPrice: 0.9, expiry: new Date().toISOString() }); });
    expect(out.ok).toBe(true);
    const m = result.current.markdowns[0];
    expect(m.status).toBe('active');
    expect(m.reducedPrice).toBe(0.9);
    expect(m.soldReported).toBe(0);
  });

  it('refuses to create on hard-stop stock', () => {
    const { result } = renderHook(() => useMarkdowns());
    let out;
    act(() => { out = result.current.createMarkdown({ productId: 'p1', name: 'Meds', qty: 1, originalPrice: 5, reducedPrice: 2, mustPull: true }); });
    expect(out.ok).toBe(false);
    expect(result.current.markdowns).toHaveLength(0);
  });
});

describe('markdownStore — outcome is reported (estimated), kept separate from confirmed sales', () => {
  it('records a sold/binned split and estimates recovery from reported sold only', () => {
    const { result } = renderHook(() => useMarkdowns());
    let id;
    act(() => { id = result.current.createMarkdown({ productId: 'p1', name: 'Milk', qty: 4, originalPrice: 1.5, reducedPrice: 1 }).markdown.id; });
    act(() => { result.current.recordOutcome(id, { soldReported: 3, binned: 1 }); });
    const m = result.current.markdowns.find((x) => x.id === id);
    expect(m.status).toBe('closed');
    expect(m.soldReported).toBe(3);
    expect(m.binned).toBe(1);
    expect(estimatedRecovery(m)).toBe(3); // 3 × £1 reduced — ESTIMATE, not a confirmed receipt
  });
});

describe('markdownStore — helpers', () => {
  it('label text shows was/now and sell-by', () => {
    const txt = markdownLabelText({ name: 'Milk', originalPrice: 1.5, reducedPrice: 0.9, expiry: '2026-10-05' });
    expect(txt).toMatch(/REDUCED/);
    expect(txt).toMatch(/0\.90/);
    expect(txt).toMatch(/Sell by/);
  });
  it('totals are estimated-only', () => {
    const t = markdownTotals([
      { status: 'active', qty: 2, reducedPrice: 1, soldReported: 0, binned: 0 },
      { status: 'closed', qty: 3, reducedPrice: 1, soldReported: 2, binned: 1 },
    ]);
    expect(t.activeCount).toBe(1);
    expect(t.unitsOnOffer).toBe(2);
    expect(t.estimatedRecovery).toBe(2);
    expect(t.reportedBinned).toBe(1);
  });
});
