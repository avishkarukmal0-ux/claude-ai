import { describe, it, expect } from 'vitest';
import {
  buildJourneys, activeJourneys, claimableIssues, hasClaimFor, claimsForDelivery,
} from '../buyingJourney';

const now = Date.now();
const stageOf = (j, key) => j.stages.find((s) => s.key === key);

describe('buyingJourney — stage derivation', () => {
  it('open order with no delivery → awaiting delivery, next action = receive', () => {
    const orders = [{ id: 'o1', status: 'ordered', orderedAt: now, supplierName: 'Bestway', lines: [{ qty: 10, receivedQty: 0 }] }];
    const [j] = buildJourneys({ orders, now });
    expect(j.anchor).toBe('order');
    expect(stageOf(j, 'order').status).toBe('done');
    expect(j.currentStage).toBe('delivery');
    expect(j.nextAction.go).toEqual({ screen: 'receive' });
    expect(j.complete).toBe(false);
  });

  it('D8: a part-received order still surfaces an active journey for the outstanding remainder', () => {
    const orders = [{ id: 'o1', status: 'ordered', orderedAt: now, supplierName: 'Bestway', lines: [{ qty: 10, receivedQty: 5 }] }];
    const deliveries = [{ id: 'd1', status: 'received', orderId: 'o1', supplierName: 'Bestway', lines: [{ name: 'Milk', issue: null }], receivedAt: now }];
    const active = activeJourneys({ orders, deliveries });
    // The remainder (order o1) is still in-flight even though a delivery referenced it.
    expect(active.some((j) => j.anchor === 'order')).toBe(true);
  });

  it('a recorded-but-unsent (draft) order shows order as the current stage (not sent)', () => {
    const orders = [{ id: 'o1', status: 'ordered', orderedAt: null, supplierName: 'Bestway', lines: [{ qty: 5, receivedQty: 0 }] }];
    const [j] = buildJourneys({ orders, now });
    expect(stageOf(j, 'order').status).toBe('current');
    expect(stageOf(j, 'order').detail).toMatch(/not sent/i);
    expect(j.currentStage).toBe('order');
    expect(j.nextAction.cta).toBe('Send to supplier');
  });

  it('draft delivery → current stage delivery, finish booking', () => {
    const deliveries = [{ id: 'd1', status: 'draft', supplierName: 'Bestway', lines: [{ name: 'Milk', deliveredQty: 1 }], createdAt: now }];
    const [j] = buildJourneys({ deliveries, now });
    expect(j.anchor).toBe('delivery');
    expect(stageOf(j, 'delivery').status).toBe('current');
    expect(j.nextAction.go).toEqual({ screen: 'receive' });
  });

  it('received delivery with NO order is allowed (checked directly)', () => {
    const deliveries = [{ id: 'd1', status: 'received', supplierName: 'Cash&Carry', lines: [{ name: 'Beans', issue: null }], receivedAt: now }];
    const [j] = buildJourneys({ deliveries, now });
    expect(stageOf(j, 'order').status).toBe('skipped');
    expect(stageOf(j, 'order').detail).toMatch(/no order/i);
  });

  it('received delivery with a claimable issue + no claim → resolve needs attention', () => {
    const deliveries = [{ id: 'd1', status: 'received', supplierName: 'Bestway', receivedAt: now,
      lines: [{ name: 'Crisps', issue: 'missing', orderedQty: 10, deliveredQty: 6 }] }];
    const [j] = buildJourneys({ deliveries, now });
    expect(stageOf(j, 'resolve').status).toBe('attention');
    expect(j.attention).toBe(true);
    expect(j.currentStage).toBe('resolve');
    expect(j.nextAction.cta).toBe('Raise claim');
  });

  it('received delivery, clean → complete journey (nothing to do)', () => {
    const deliveries = [{ id: 'd1', status: 'received', supplierName: 'Bestway', receivedAt: now,
      lines: [{ name: 'Beans', issue: null }] }];
    const [j] = buildJourneys({ deliveries, now });
    expect(j.complete).toBe(true);
    expect(j.nextAction).toBe(null);
    expect(activeJourneys({ deliveries, now })).toHaveLength(0);
  });

  it('claim raised but credit outstanding → credit is the current stage', () => {
    const deliveries = [{ id: 'd1', status: 'received', supplierName: 'Bestway', receivedAt: now,
      lines: [{ name: 'Crisps', issue: 'missing' }] }];
    const claims = [{ id: 'c1', deliveryId: 'd1', status: 'approved', approvedAmount: 20,
      credits: [{ creditNoteId: 'cn1', amount: 8, at: now }] }];
    const [j] = buildJourneys({ deliveries, claims, now });
    expect(stageOf(j, 'resolve').status).toBe('done');
    expect(stageOf(j, 'claim').status).toBe('done'); // approved = agreed with supplier
    expect(stageOf(j, 'credit').status).toBe('current');
    expect(stageOf(j, 'credit').detail).toContain('12.00'); // 20 − 8 still to receive
    expect(j.nextAction.go).toEqual({ screen: 'credit-notes' });
  });

  it('a submitted (not-yet-agreed) claim → chase the claim is the next action', () => {
    const deliveries = [{ id: 'd1', status: 'received', supplierName: 'Bestway', receivedAt: now,
      lines: [{ name: 'Crisps', issue: 'missing' }] }];
    const claims = [{ id: 'c1', deliveryId: 'd1', status: 'submitted', requestedAmount: 15 }];
    const [j] = buildJourneys({ deliveries, claims, now });
    expect(stageOf(j, 'claim').status).toBe('current');
    expect(j.currentStage).toBe('claim');
    expect(j.nextAction.cta).toBe('Follow up claim');
  });

  it('claim settled + credit fully received → complete, carries invoice ref', () => {
    const invoices = [{ id: 'inv1', status: 'committed', reference: 'INV-99' }];
    const deliveries = [{ id: 'd1', status: 'received', supplierName: 'Bestway', reference: 'DEL-1', receivedAt: now,
      lines: [{ name: 'Crisps', issue: 'missing' }] }];
    const claims = [{ id: 'c1', deliveryId: 'd1', invoiceId: 'inv1', status: 'settled', approvedAmount: 10,
      credits: [{ creditNoteId: 'cn1', amount: 10, at: now }] }];
    const [j] = buildJourneys({ deliveries, invoices, claims, now });
    expect(j.complete).toBe(true);
    expect(j.refs.invoiceRef).toBe('INV-99');
    expect(j.refs.deliveryRef).toBe('DEL-1');
    expect(stageOf(j, 'credit').status).toBe('done');
  });

  it('partial delivery against an order shows part-received', () => {
    const orders = [{ id: 'o1', status: 'partially_received', orderedAt: now, supplierName: 'Bestway',
      lines: [{ qty: 10, receivedQty: 6 }] }];
    const deliveries = [{ id: 'd1', orderId: 'o1', status: 'received', supplierName: 'Bestway', receivedAt: now, lines: [{ name: 'X', issue: null }] }];
    // The delivery journey shows the order stage as part-received (D8 also adds a separate remainder journey).
    const j = buildJourneys({ orders, deliveries, now }).find((x) => x.anchor === 'delivery');
    expect(stageOf(j, 'order').detail).toMatch(/part-received/i);
  });
});

describe('buyingJourney — ordering & duplicate guards', () => {
  it('active (incomplete) journeys sort before complete ones', () => {
    const deliveries = [
      { id: 'done1', status: 'received', receivedAt: now - 1000, lines: [{ issue: null }] },
      { id: 'draft1', status: 'draft', createdAt: now, lines: [{ name: 'x' }] },
    ];
    const js = buildJourneys({ deliveries, now });
    expect(js[0].complete).toBe(false);
    expect(js[1].complete).toBe(true);
  });

  it('hasClaimFor / claimsForDelivery prevent duplicate claims', () => {
    const claims = [{ id: 'c1', deliveryId: 'd1', invoiceId: 'inv1', status: 'submitted' }];
    expect(hasClaimFor(claims, { deliveryId: 'd1' })).toBe(true);
    expect(hasClaimFor(claims, { invoiceId: 'inv1' })).toBe(true);
    expect(hasClaimFor(claims, { deliveryId: 'd2' })).toBe(false);
    expect(claimsForDelivery(claims, 'd1')).toHaveLength(1);
  });

  it('claimableIssues filters to claimable issue types only', () => {
    const delivery = { lines: [{ issue: 'missing' }, { issue: 'extra' }, { issue: 'damaged' }, { issue: null }] };
    // missing + damaged are claimable; extra is not
    expect(claimableIssues(delivery)).toHaveLength(2);
  });

  it('does not throw on empty / null inputs', () => {
    expect(buildJourneys()).toEqual([]);
    expect(buildJourneys({ orders: null, deliveries: null, claims: null })).toEqual([]);
  });
});
