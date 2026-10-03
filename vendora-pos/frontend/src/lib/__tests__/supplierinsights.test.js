import { describe, it, expect } from 'vitest';
import { unitCostBySupplier, compareSuppliersForProduct, supplierReliability, supplierScorecards } from '../supplierInsights';
import { paymentCalendar } from '../paymentCalendar';

// Committed invoices with per-unit (or case) lines for product p1 from two suppliers.
const inv = (o) => ({ status: 'committed', ...o });
const line = (o) => ({ productId: 'p1', name: 'Cola', qty: 1, qtyMode: 'units', packSize: 1, unitCost: 0, caseCost: 0, ...o });

describe('supplierInsights — equivalent unit cost across suppliers', () => {
  const invoices = [
    inv({ id: 'i1', supplierName: 'Bestway', date: 1000, reference: 'B1', lines: [line({ unitCost: 1.0 })] }),
    inv({ id: 'i2', supplierName: 'Booker', date: 2000, reference: 'K1', lines: [line({ qtyMode: 'cases', packSize: 24, caseCost: 21.6 })] }), // £0.90/unit
    inv({ id: 'i3', supplierName: 'Bestway', date: 3000, reference: 'B2', lines: [line({ unitCost: 1.1 })] }), // newer Bestway
  ];

  it('takes the latest cost per supplier and sorts cheapest first, with source + date', () => {
    const rows = unitCostBySupplier(invoices, 'p1');
    expect(rows.map((r) => r.supplierName)).toEqual(['Booker', 'Bestway']); // 0.90 < 1.10
    const bestway = rows.find((r) => r.supplierName === 'Bestway');
    expect(bestway.unitCost).toBe(1.1);          // latest, not the older 1.0
    expect(bestway.invoiceRef).toBe('B2');        // source invoice
    expect(bestway.date).toBe(3000);
  });

  it('comparison reports cheapest/saving + a note on missing delivery charges', () => {
    const cmp = compareSuppliersForProduct(invoices, { id: 'p1', name: 'Cola' });
    expect(cmp.cheapest.supplierName).toBe('Booker');
    expect(cmp.saving).toBe(0.2); // 1.10 − 0.90
    expect(cmp.note).toMatch(/delivery charges not recorded/i);
  });

  it('factors a known delivery charge into the effective cost', () => {
    const cmp = compareSuppliersForProduct(invoices, { id: 'p1', name: 'Cola' }, { unitDeliveryCharges: { Booker: 0.25 } });
    // Booker 0.90 + 0.25 = 1.15 > Bestway 1.10 → Bestway now cheapest
    expect(cmp.cheapest.supplierName).toBe('Bestway');
  });

  it('explains missing data instead of ranking on nothing', () => {
    const cmp = compareSuppliersForProduct([], { id: 'p1', name: 'Cola' });
    expect(cmp.rows).toHaveLength(0);
    expect(cmp.note).toMatch(/no confirmed invoice cost/i);
  });
});

describe('supplierInsights — reliability facts (no ranking)', () => {
  const deliveries = [
    { supplierId: 's1', status: 'received', lines: [{ issue: 'missing' }] },
    { supplierId: 's1', status: 'received', lines: [{ issue: null }] },
    { supplierId: 's1', status: 'draft', lines: [{ issue: 'missing' }] }, // not received → ignored
  ];
  const claims = [
    { supplierId: 's1', status: 'settled', createdAt: 0, history: [{ status: 'settled', at: 5 * 86400000 }] }, // 5 days
    { supplierId: 's1', status: 'submitted', createdAt: 0 },
  ];

  it('counts shortages and averages settled-claim turnaround', () => {
    const r = supplierReliability('s1', { deliveries, claims });
    expect(r.deliveries).toBe(2);        // received only
    expect(r.withShortage).toBe(1);
    expect(r.shortageRate).toBe(50);
    expect(r.avgTurnaroundDays).toBe(5);
    expect(r.claims).toBe(2);
    expect(r.settled).toBe(1);
  });

  it('names missing data when there is none', () => {
    const r = supplierReliability('nobody', { deliveries, claims });
    expect(r.missing).toContain('no received deliveries recorded');
  });

  it('scorecards are facts only (no overall score field)', () => {
    const cards = supplierScorecards({ suppliers: [{ id: 's1', name: 'Bestway' }], deliveries, claims, invoices: [] });
    expect(cards[0].name).toBe('Bestway');
    expect(cards[0]).not.toHaveProperty('rank');
    expect(cards[0]).not.toHaveProperty('score');
  });
});

describe('paymentCalendar — due / commitments / expected credits kept separate', () => {
  const now = new Date('2026-10-15T12:00:00Z').getTime();
  const invoices = [
    { id: 'i1', status: 'committed', supplierName: 'Bestway', total: 100, dueDate: '2026-10-10', payments: [] },        // overdue, unpaid
    { id: 'i2', status: 'committed', supplierName: 'Booker', total: 50, dueDate: '2026-10-20', payments: [{ id: 'p', amount: 20 }] }, // partial, 30 owed
    { id: 'i3', status: 'committed', supplierName: 'NoTotal', dueDate: '2026-10-18', payments: [], lines: [] },         // no total
    { id: 'i4', status: 'committed', supplierName: 'Paid', total: 10, payments: [{ id: 'p2', amount: 10 }] },           // paid → excluded
  ];
  const orders = [{ id: 'o1', status: 'ordered', orderedAt: now, lines: [{ qty: 10, unitCost: 2 }] }]; // £20 commitment
  const claims = [{ status: 'approved', approvedAmount: 15, credits: [] }]; // £15 expected credit

  it('lists payable invoices soonest-first, flags overdue, nets partial payments', () => {
    const c = paymentCalendar({ invoices, orders, claims, now });
    expect(c.counts.payable).toBe(3); // paid one excluded
    const i1 = c.dueSoon.find((d) => d.invoiceId === 'i1');
    expect(i1.overdue).toBe(true);
    const i2 = c.dueSoon.find((d) => d.invoiceId === 'i2');
    expect(i2.owed).toBe(30);        // 50 − 20 paid
    expect(i2.status).toBe('partial');
  });

  it('totals owed from known totals only; keeps commitments and expected credits separate', () => {
    const c = paymentCalendar({ invoices, orders, claims, now });
    expect(c.totalOwed).toBe(130);        // 100 + 30 (NoTotal excluded)
    expect(c.commitments).toBe(20);        // open order cost
    expect(c.expectedCredits).toBe(15);    // NOT netted into totalOwed
    expect(c.warnings.some((w) => /no total/i.test(w))).toBe(true);
  });
});
