import { describe, it, expect } from 'vitest';
import { reconcile, discrepanciesToClaimItems } from '../reconcile';

// delivery line: orderedQty/deliveredQty + packSize/qtyMode + unitCost/caseCost
const dl = (o) => ({ productId: null, barcode: '', name: '', orderedQty: 0, deliveredQty: 0, packSize: 1, qtyMode: 'units', unitCost: 0, caseCost: 0, ...o });
// invoice line: qty + packSize/qtyMode + unitCost/caseCost
const il = (o) => ({ productId: null, barcode: '', name: '', qty: 0, packSize: 1, qtyMode: 'units', unitCost: 0, caseCost: 0, ...o });

describe('reconcile — pack/unit normalisation', () => {
  it('compares a cases invoice line against a units delivery line in single units', () => {
    const delivery = { lines: [dl({ barcode: '1', name: 'Cola', deliveredQty: 48, unitCost: 1 })] };
    const invoice = { lines: [il({ barcode: '1', name: 'Cola', qty: 2, qtyMode: 'cases', packSize: 24, caseCost: 24 })] }; // 48 units @ £1
    const { summary } = reconcile({ delivery, invoice });
    expect(summary.claimable).toBe(0); // 48 vs 48, £1 vs £1 → no discrepancy
  });
});

describe('reconcile — order-awareness (Phase 2, info-only)', () => {
  const ol = (o) => ({ productId: null, barcode: '', name: '', qty: 0, unitCost: null, ...o });

  it('flags ordered-vs-delivered shortfall as INFO (no extra claimable amount)', () => {
    const order = { lines: [ol({ barcode: '1', name: 'Cola', qty: 24, unitCost: 1 })] };
    const delivery = { lines: [dl({ barcode: '1', name: 'Cola', deliveredQty: 20, unitCost: 1 })] };
    const invoice = { lines: [il({ barcode: '1', name: 'Cola', qty: 20, unitCost: 1 })] }; // billed = delivered → no claim
    const { discrepancies, summary } = reconcile({ delivery, invoice, order });
    const shortVsOrder = discrepancies.find((d) => d.type === 'order_short');
    expect(shortVsOrder).toBeTruthy();
    expect(shortVsOrder.claimReason).toBe(null);
    expect(shortVsOrder.units).toBe(4); // ordered 24 − delivered 20
    expect(summary.claimable).toBe(0); // order info never adds a claim
  });

  it('flags agreed-vs-invoiced price difference as INFO', () => {
    const order = { lines: [ol({ barcode: '1', name: 'Cola', qty: 10, unitCost: 1 })] };
    const delivery = { lines: [dl({ barcode: '1', name: 'Cola', deliveredQty: 10, unitCost: 1.2 })] };
    const invoice = { lines: [il({ barcode: '1', name: 'Cola', qty: 10, unitCost: 1.2 })] };
    const { discrepancies } = reconcile({ delivery, invoice, order });
    const priceInfo = discrepancies.find((d) => d.type === 'order_price');
    expect(priceInfo).toBeTruthy();
    expect(priceInfo.claimReason).toBe(null);
    expect(priceInfo.detail).toMatch(/ordered at/i);
  });

  it('no order → behaves exactly as before (no order_* discrepancies)', () => {
    const delivery = { lines: [dl({ barcode: '1', name: 'Cola', deliveredQty: 10, unitCost: 1 })] };
    const invoice = { lines: [il({ barcode: '1', name: 'Cola', qty: 10, unitCost: 1 })] };
    const { discrepancies } = reconcile({ delivery, invoice });
    expect(discrepancies.some((d) => d.type === 'order_short' || d.type === 'order_price')).toBe(false);
  });
});

describe('reconcile — source references + calculation detail (A1/A2)', () => {
  it('every claimable discrepancy carries source doc + line refs and a calc detail', () => {
    const delivery = { id: 'del_1', lines: [dl({ id: 'dln_1', barcode: '1', name: 'Cola', deliveredQty: 10, unitCost: 1 })] };
    const invoice = { id: 'inv_1', reference: 'INV-99', lines: [il({ id: 'iln_1', barcode: '1', name: 'Cola', qty: 20, unitCost: 1.2 })] };
    const { discrepancies } = reconcile({ delivery, invoice });
    for (const d of discrepancies.filter((x) => x.claimReason)) {
      expect(d.invoiceId).toBe('inv_1');
      expect(d.invoiceRef).toBe('INV-99');
      expect(d.deliveryId).toBe('del_1');
      expect(d.invoiceLineId).toBe('iln_1');
      expect(typeof d.detail).toBe('string');
      expect(d.detail.length).toBeGreaterThan(0);
    }
    // shortage line matched a delivery line → carries its id; claim items keep the refs + detail.
    const items = discrepanciesToClaimItems(discrepancies);
    const shortItem = items.find((i) => i.reason === 'missing');
    expect(shortItem).toMatchObject({ invoiceId: 'inv_1', invoiceRef: 'INV-99', invoiceLineId: 'iln_1', deliveryLineId: 'dln_1' });
    expect(shortItem.detail).toContain('short');
  });
});

describe('reconcile — discrepancy types', () => {
  it('shortage: billed for more units than delivered', () => {
    const delivery = { lines: [dl({ barcode: '1', name: 'Cola', deliveredQty: 24, unitCost: 1 })] };
    const invoice = { lines: [il({ barcode: '1', name: 'Cola', qty: 48, unitCost: 1 })] };
    const { discrepancies, summary } = reconcile({ delivery, invoice });
    const short = discrepancies.find((d) => d.type === 'shortage');
    expect(short).toBeTruthy();
    expect(short.units).toBe(24);
    expect(short.overcharge).toBe(24); // 24 short × £1
    expect(summary.overcharge).toBe(24);
  });

  it('overcharge: invoice unit price above the agreed delivered price', () => {
    const delivery = { lines: [dl({ barcode: '1', name: 'Cola', deliveredQty: 10, unitCost: 1 })] };
    const invoice = { lines: [il({ barcode: '1', name: 'Cola', qty: 10, unitCost: 1.2 })] };
    const { discrepancies } = reconcile({ delivery, invoice });
    const over = discrepancies.find((d) => d.type === 'overcharge');
    expect(over.overcharge).toBeCloseTo(2); // (1.2 − 1.0) × 10
    expect(over).toMatchObject({ claimReason: 'wrong_price', unitBilled: 1.2, unitAgreed: 1 });
  });

  it('shortage + overcharge together do not double-count units (disjoint sets)', () => {
    const delivery = { lines: [dl({ barcode: '1', name: 'Cola', deliveredQty: 8, unitCost: 1 })] };
    const invoice = { lines: [il({ barcode: '1', name: 'Cola', qty: 10, unitCost: 1.5 })] };
    const { discrepancies } = reconcile({ delivery, invoice });
    const short = discrepancies.find((d) => d.type === 'shortage');
    const over = discrepancies.find((d) => d.type === 'overcharge');
    expect(short.overcharge).toBeCloseTo(2 * 1.5);   // 2 short × £1.50 invoice price
    expect(over.overcharge).toBeCloseTo((1.5 - 1) * 8); // 8 delivered × £0.50 overcharge
  });

  it('not_delivered: invoice line with no matching delivery line claims the full value', () => {
    const delivery = { lines: [dl({ barcode: '1', name: 'Cola', deliveredQty: 10, unitCost: 1 })] };
    const invoice = { lines: [il({ barcode: '9', name: 'Crisps', qty: 5, unitCost: 2 })] };
    const { discrepancies } = reconcile({ delivery, invoice });
    const nd = discrepancies.find((d) => d.type === 'not_delivered');
    expect(nd.overcharge).toBe(10); // 5 × £2
    expect(nd.claimReason).toBe('missing');
  });

  it('extra_delivered is informational (no claim)', () => {
    const delivery = { lines: [dl({ barcode: '1', name: 'Cola', deliveredQty: 10, unitCost: 1 }), dl({ barcode: '2', name: 'Water', deliveredQty: 5, unitCost: 1 })] };
    const invoice = { lines: [il({ barcode: '1', name: 'Cola', qty: 10, unitCost: 1 })] };
    const { discrepancies, summary } = reconcile({ delivery, invoice });
    expect(summary.claimable).toBe(0);
    expect(discrepancies.some((d) => d.type === 'extra_delivered' && d.name === 'Water')).toBe(true);
  });

  // Audit D3: delivered units are a shared pool per product. Multiple delivery lines must be summed, and
  // multiple invoice lines must consume (not reuse) that pool.
  it('D3: two delivery lines for one product sum — no false shortage against a single invoice line', () => {
    const delivery = { lines: [
      dl({ barcode: '1', name: 'Cola', deliveredQty: 5, unitCost: 1 }),
      dl({ barcode: '1', name: 'Cola', deliveredQty: 5, unitCost: 1 }),
    ] };
    const invoice = { lines: [il({ barcode: '1', name: 'Cola', qty: 10, unitCost: 1 })] };
    const { discrepancies, summary } = reconcile({ delivery, invoice });
    expect(summary.claimable).toBe(0); // 5+5 delivered covers the 10 invoiced
    expect(discrepancies.some((d) => d.type === 'shortage')).toBe(false);
  });

  it('D3: two invoice lines for one product consume delivered units once — real shortage caught', () => {
    const delivery = { lines: [dl({ barcode: '1', name: 'Cola', deliveredQty: 5, unitCost: 1 })] };
    const invoice = { lines: [
      il({ barcode: '1', name: 'Cola', qty: 5, unitCost: 1 }),
      il({ barcode: '1', name: 'Cola', qty: 5, unitCost: 1 }),
    ] };
    const { discrepancies, summary } = reconcile({ delivery, invoice });
    // Only 5 delivered but 10 invoiced across two lines → 5-unit shortage, not reused away to zero.
    const shortages = discrepancies.filter((d) => d.type === 'shortage');
    expect(shortages.length).toBe(1); // the second line is entirely short
    expect(shortages[0].units).toBe(5);
    expect(summary.overcharge).toBe(5); // 5 short × £1
  });

  it('D3: units-weighted agreed price drives overcharge across mixed-cost delivery lines', () => {
    const delivery = { lines: [
      dl({ barcode: '1', name: 'Cola', deliveredQty: 5, unitCost: 1 }),   // £1 × 5
      dl({ barcode: '1', name: 'Cola', deliveredQty: 5, unitCost: 2 }),   // £2 × 5 → weighted £1.50
    ] };
    const invoice = { lines: [il({ barcode: '1', name: 'Cola', qty: 10, unitCost: 2 })] };
    const { discrepancies } = reconcile({ delivery, invoice });
    const over = discrepancies.find((d) => d.type === 'overcharge');
    expect(over).toBeTruthy();
    expect(over.unitAgreed).toBeCloseTo(1.5); // (1×5 + 2×5)/10
    expect(over.overcharge).toBeCloseTo((2 - 1.5) * 10); // £0.50 × 10
  });

  it('discrepanciesToClaimItems maps only claimable rows into claim-item shape', () => {
    const delivery = { lines: [dl({ barcode: '1', name: 'Cola', deliveredQty: 8, unitCost: 1 })] };
    const invoice = { lines: [il({ barcode: '1', name: 'Cola', qty: 10, unitCost: 1.5 })] };
    const { discrepancies } = reconcile({ delivery, invoice });
    const items = discrepanciesToClaimItems(discrepancies);
    expect(items.length).toBe(2); // shortage + overcharge
    expect(items.every((i) => i.reason && i.amount > 0)).toBe(true);
    expect(items.find((i) => i.reason === 'wrong_price')).toMatchObject({ unitBilled: 1.5, unitAgreed: 1 });
  });
});
