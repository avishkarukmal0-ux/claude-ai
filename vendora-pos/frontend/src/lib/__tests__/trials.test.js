import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTrials, trialOutcome } from '../trialStore';
import { setActiveWorkspace } from '../storage';

let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:tr${ws++}`); });

describe('trialStore — create + lifecycle', () => {
  it('creates a planned trial and requires a name + quantity', () => {
    const { result } = renderHook(() => useTrials());
    let bad; let good;
    act(() => { bad = result.current.createTrial({ name: '', qty: 10 }); });
    expect(bad.ok).toBe(false);
    act(() => { good = result.current.createTrial({ name: 'Oat milk', qty: 12, budget: 10, reviewDate: '2026-11-01', hypothesis: 'Local demand for plant milks' }); });
    expect(good.ok).toBe(true);
    expect(result.current.trials[0].status).toBe('planned');
    expect(result.current.trials[0].budget).toBe(10);
  });

  it('received → decide closes with a decision', () => {
    const { result } = renderHook(() => useTrials());
    let id;
    act(() => { id = result.current.createTrial({ name: 'Oat milk', qty: 12 }).trial.id; });
    act(() => { result.current.setStatus(id, 'received'); });
    expect(result.current.trials.find((t) => t.id === id).receivedAt).toBeTruthy();
    act(() => { result.current.decide(id, 'repeat'); });
    const t = result.current.trials.find((x) => x.id === id);
    expect(t.status).toBe('closed');
    expect(t.decision).toBe('repeat');
  });
});

describe('trialStore — outcome is honest (confirmed sales only)', () => {
  const trial = { qty: 12 };
  it('says "Not enough data" without a confirmed sales source', () => {
    const o = trialOutcome(trial, { soldUnits: null, hasSalesData: false });
    expect(o.enoughData).toBe(false);
    expect(o.verdict).toBe('no-data');
    expect(o.summary).toMatch(/Not enough data/);
    expect(o.sellThroughPct).toBe(null);
  });

  it('computes sell-through from confirmed sales', () => {
    const o = trialOutcome(trial, { soldUnits: 9, remainingQty: 3, wasteUnits: 0, hasSalesData: true });
    expect(o.enoughData).toBe(true);
    expect(o.sellThroughPct).toBe(75);
    expect(o.verdict).toBe('selling');
    expect(o.summary).toMatch(/9 of 12 sold/);
  });

  it('flags a slow trial (low sell-through) without claiming proven/dis-proven demand', () => {
    const o = trialOutcome(trial, { soldUnits: 1, remainingQty: 10, wasteUnits: 1, hasSalesData: true });
    expect(o.verdict).toBe('slow');
    expect(o.summary).not.toMatch(/demand/i); // never asserts demand either way
  });
});
