'use strict';

// Pure unit test — no DB. Covers finding 3B refund correctness (quantity validation, no
// double/excessive refunds, discount-aware amounts). Shop-scoping is enforced by the Mongo
// query in processRefund and is exercised by refundVoid.integration.test.js.
const { computeRefundLines } = require('../services/refundService');

function saleFixture(overrides = {}) {
  return {
    _id: 's1',
    total: 10,
    items: [
      { product: { toString: () => 'p1' }, barcode: '111', name: 'Crisps', quantity: 2, unitPrice: 5, lineTotal: 10 },
    ],
    ...overrides,
  };
}

describe('computeRefundLines — validation', () => {
  it('refunds a valid partial quantity at the price paid', () => {
    const { refundItems, refundAmount } = computeRefundLines({
      sale: saleFixture(), itemsToRefund: [{ barcode: '111', quantity: 1 }], priorRefunds: [],
    });
    expect(refundItems).toHaveLength(1);
    expect(refundItems[0].quantity).toBe(1);
    expect(refundAmount).toBe(5); // 10/2 per unit × 1
  });

  it('is discount-aware — refunds the discounted price actually paid, not the list price', () => {
    const sale = saleFixture({ items: [{ product: { toString: () => 'p1' }, barcode: '111', name: 'Crisps', quantity: 2, unitPrice: 5, lineTotal: 8 }] });
    const { refundAmount } = computeRefundLines({ sale, itemsToRefund: [{ barcode: '111', quantity: 1 }], priorRefunds: [] });
    expect(refundAmount).toBe(4); // 8/2 per unit, not 5
  });

  it('rejects quantities beyond what was sold', () => {
    expect(() => computeRefundLines({
      sale: saleFixture(), itemsToRefund: [{ barcode: '111', quantity: 3 }], priorRefunds: [],
    })).toThrow(/remain refundable/);
  });

  it('rejects zero, negative and non-integer quantities', () => {
    expect(() => computeRefundLines({ sale: saleFixture(), itemsToRefund: [{ barcode: '111', quantity: 0 }], priorRefunds: [] })).toThrow();
    expect(() => computeRefundLines({ sale: saleFixture(), itemsToRefund: [{ barcode: '111', quantity: -1 }], priorRefunds: [] })).toThrow();
    expect(() => computeRefundLines({ sale: saleFixture(), itemsToRefund: [{ barcode: '111', quantity: 1.5 }], priorRefunds: [] })).toThrow();
  });

  it('subtracts prior refunds so the same items cannot be refunded twice', () => {
    // Refund records carry product + barcode, exactly like the sale line (keyed consistently).
    const priorRefunds = [{ refundAmount: 10, items: [{ product: 'p1', barcode: '111', quantity: 2 }] }];
    expect(() => computeRefundLines({
      sale: saleFixture(), itemsToRefund: [{ barcode: '111', quantity: 1 }], priorRefunds,
    })).toThrow(/only 0 remain/);
  });

  it('defaults to the remaining quantity when none is specified', () => {
    const priorRefunds = [{ refundAmount: 5, items: [{ product: 'p1', barcode: '111', quantity: 1 }] }];
    const { refundItems } = computeRefundLines({ sale: saleFixture(), itemsToRefund: [{ barcode: '111' }], priorRefunds });
    expect(refundItems[0].quantity).toBe(1); // 2 sold − 1 already refunded
  });

  it('rejects an unknown item', () => {
    expect(() => computeRefundLines({ sale: saleFixture(), itemsToRefund: [{ barcode: 'nope', quantity: 1 }], priorRefunds: [] })).toThrow();
  });
});
