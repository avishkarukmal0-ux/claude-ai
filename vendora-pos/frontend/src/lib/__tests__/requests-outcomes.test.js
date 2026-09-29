import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRequests, sortRequests } from '../requestStore';
import { monthlyOutcomes, sameMonth } from '../outcomes';
import { setActiveWorkspace } from '../storage';

let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:ro${ws++}`); });
const DAY = 86400000;

describe('requestStore — repeat-request counting', () => {
  it('re-asking for the same open item bumps the count instead of duplicating', () => {
    const { result } = renderHook(() => useRequests());
    act(() => { result.current.addRequest({ name: 'Oat milk' }); });
    act(() => { result.current.addRequest({ name: 'oat MILK' }); }); // case-insensitive match
    act(() => { result.current.addRequest({ name: 'Gluten-free bread' }); });
    expect(result.current.requests.length).toBe(2);
    expect(result.current.requests.find((r) => /oat/i.test(r.name)).count).toBe(2);
  });

  it('once stocked, a fresh ask starts a new open request; sort puts open + most-asked first', () => {
    const { result } = renderHook(() => useRequests());
    let id;
    act(() => { id = result.current.addRequest({ name: 'Oat milk' }).id; });
    act(() => { result.current.setStatus(id, 'stocked'); });
    act(() => { result.current.addRequest({ name: 'Oat milk' }); }); // new open one
    const open = result.current.requests.filter((r) => r.status === 'open');
    expect(open.length).toBe(1);
    const order = sortRequests(result.current.requests);
    expect(order[0].status).toBe('open');
  });
});

describe('outcomes — actuals only, estimates separate', () => {
  const now = Date.now();
  const lastMonth = new Date(now); lastMonth.setMonth(lastMonth.getMonth() - 1);

  it('sameMonth respects calendar month', () => {
    expect(sameMonth(now, now)).toBe(true);
    expect(sameMonth(lastMonth.getTime(), now)).toBe(false);
  });

  it('aggregates confirmed credit, resolved claims, tasks, coverage; keeps rescued separate', () => {
    const claims = [
      { status: 'settled', receivedAmount: 10, history: [{ status: 'settled', at: now }] },
      { status: 'settled', receivedAmount: 5, history: [{ status: 'settled', at: lastMonth.getTime() }] }, // last month → excluded
      { status: 'rejected', history: [{ status: 'rejected', at: now }] },
      { status: 'approved', approvedAmount: 8, history: [{ status: 'approved', at: now }] }, // outstanding, not received
    ];
    const tasks = [
      { history: [{ action: 'completed', at: now }] },
      { history: [{ action: 'acknowledged', at: now }] },
      { history: [{ action: 'completed', at: lastMonth.getTime() }] }, // excluded
    ];
    const products = [
      { countedAt: now }, { countedAt: now }, { countedAt: null }, { countedAt: lastMonth.getTime() },
    ];
    const stocktakeHistory = [{ finishedAt: now }, { finishedAt: lastMonth.getTime() }];

    const o = monthlyOutcomes({ claims, tasks, products, stocktakeHistory, monthWasted: 12.5, monthSaved: 30, now });
    expect(o.creditReceived).toBe(10);        // only this-month settled
    expect(o.creditOutstanding).toBe(8);       // approved but not received
    expect(o.discrepanciesResolved).toBe(2);   // settled + rejected this month
    expect(o.tasksCompleted).toBe(2);          // this month only
    expect(o.coverageCounted).toBe(2);
    expect(o.coverageTotal).toBe(4);
    expect(o.coveragePct).toBe(50);
    expect(o.stockChecks).toBe(1);
    expect(o.wasteCost).toBe(12.5);
    expect(o.estimated.rescued).toBe(30);      // separate, not mixed into actuals
  });
});
