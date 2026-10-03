import { describe, it, expect } from 'vitest';
import { weeklyReport } from '../report';
import { MOVEMENT_TYPES } from '../movementStore';

const now = Date.UTC(2026, 9, 8);
const DAY = 86400000;
const recent = now - 2 * DAY;
const old = now - 30 * DAY;

describe('weeklyReport', () => {
  it('counts only this-period checking activity and separates pending vs recovered', () => {
    const deliveries = [
      { status: 'received', supplierName: 'Booker', reference: 'D1', receivedAt: recent, lines: [{}] },
      { status: 'received', supplierName: 'Old', reference: 'D0', receivedAt: old, lines: [{}] },
    ];
    const claims = [
      { status: 'approved', approvedAmount: 20, receivedAmount: 5, credits: [{ amount: 5, at: recent }] },
      { status: 'settled', approvedAmount: 10, receivedAmount: 10, credits: [{ amount: 10, at: old }] }, // recovered but OLD
    ];
    const rep = weeklyReport({ deliveries, claims, periodDays: 7, now });
    expect(rep.checking.deliveriesReceived).toHaveLength(1); // old one excluded
    expect(rep.claims.outstanding).toBeCloseTo(15); // 20 approved − 5 received (pending)
    expect(rep.claims.creditsReceived).toBeCloseTo(5); // only the recent credit counts as recovered
  });

  it('sums waste from WASTE movements in the period', () => {
    const movements = [
      { type: MOVEMENT_TYPES.WASTE, delta: -3, valuation: 6, at: recent },
      { type: MOVEMENT_TYPES.WASTE, delta: -2, valuation: 4, at: old }, // excluded
      { type: MOVEMENT_TYPES.SALE, delta: -5, valuation: 10, at: recent }, // not waste
    ];
    const rep = weeklyReport({ movements, periodDays: 7, now });
    expect(rep.expiry.wasteUnits).toBe(3);
    expect(rep.expiry.wasteCost).toBeCloseTo(6);
  });

  it('lists purchase-price changes whose latest confirmed cost landed this period', () => {
    const products = [{ id: 'p1', name: 'Cola', price: 2 }];
    const invoices = [
      { id: 'a', status: 'committed', date: old, lines: [{ productId: 'p1', qtyMode: 'units', unitCost: 1 }] },
      { id: 'b', status: 'committed', date: recent, lines: [{ productId: 'p1', qtyMode: 'units', unitCost: 1.3 }] },
    ];
    const rep = weeklyReport({ invoices, products, periodDays: 7, now });
    expect(rep.priceChanges).toHaveLength(1);
    expect(rep.priceChanges[0]).toMatchObject({ name: 'Cola', from: 1, to: 1.3 });
  });
});
