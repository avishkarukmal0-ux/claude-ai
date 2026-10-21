'use strict';

const pos = require('../services/posProviders');
const { AVAIL, CONNECTION } = pos;
const sm = pos.salesModel;

describe('POS provider registry — honest availability', () => {
  test('all nine providers are catalogued', () => {
    const ids = pos.listProviders().map((p) => p.id).sort();
    expect(ids).toEqual(['edgepos', 'eposnow', 'lightspeed', 'paypoint', 'shopify', 'shopmate', 'square', 'sumup', 'zettle']);
  });

  test('availability is separate from a shop connection status (no provider is ever "connected")', () => {
    for (const p of pos.listProviders()) {
      expect(Object.values(AVAIL)).toContain(p.availability);
      expect(Object.values(CONNECTION)).not.toContain(p.availability);
    }
  });

  test('SumUp is UNSUPPORTED for item-level stock (payment-level only) — the brief\'s warning', () => {
    const s = pos.getProvider('sumup');
    expect(s.availability).toBe(AVAIL.UNSUPPORTED_SETUP);
    expect(s.itemLevel).toBe('none');
    expect(s.connectionMethods).toEqual(['csv']); // no cloud stock path
  });

  test('providers with a documented item-level API are ready for testing', () => {
    for (const id of ['square', 'shopify', 'zettle', 'eposnow']) {
      const p = pos.getProvider(id);
      expect(p.availability).toBe(AVAIL.READY_FOR_TESTING);
      expect(p.itemLevel).toBe('confirmed');
    }
  });

  test('partner-only providers are approval-required with unconfirmed item-level data', () => {
    for (const id of ['paypoint', 'shopmate', 'edgepos', 'lightspeed']) {
      expect(pos.getProvider(id).availability).toBe(AVAIL.APPROVAL_REQUIRED);
    }
    for (const id of ['paypoint', 'shopmate', 'edgepos']) {
      expect(pos.getProvider(id).itemLevel).toBe('unconfirmed');
    }
  });

  test('every provider carries a docs URL, a dated check and at least one blocker', () => {
    for (const p of pos.listProviders()) {
      expect(p.docsUrl).toMatch(/^https?:\/\//);
      expect(p.docsCheckedAt).toBe('2026-10-21');
      expect(Array.isArray(p.blockers) && p.blockers.length).toBeTruthy();
    }
  });

  test('the manual CSV pilot is available for every provider except where even export is payment-only', () => {
    expect(pos.csvCapableProviders().sort()).toContain('square');
    expect(pos.csvCapableProviders()).toContain('sumup'); // CSV item export is SumUp's ONLY item-level route
    expect(pos.testableProviders().sort()).toEqual(['eposnow', 'shopify', 'square', 'zettle']);
  });
});

describe('POS adapters — live ops disabled, never faked', () => {
  test('connect/fetchSales/verifyWebhook reject honestly for every provider', async () => {
    for (const a of pos.listAdapters()) {
      await expect(a.connect()).rejects.toMatchObject({ code: 'PROVIDER_NOT_AVAILABLE', providerId: a.id });
      await expect(a.fetchSales()).rejects.toMatchObject({ code: 'PROVIDER_NOT_AVAILABLE' });
      expect(() => a.normalizeSale({})).toThrow(/not verified/i); // no guessed mappings
    }
  });

  test('canConnect() is true only for ready-for-testing providers', () => {
    expect(pos.getAdapter('square').canConnect()).toBe(true);
    expect(pos.getAdapter('sumup').canConnect()).toBe(false);
    expect(pos.getAdapter('paypoint').canConnect()).toBe(false);
  });
});

describe('shared sales model — exact numeric handling + dedupe + returns', () => {
  test('money is integer minor units; unknown money is null, not zero', () => {
    expect(sm.toMinorUnits('1.20')).toBe(120);
    expect(sm.toMinorUnits('£2')).toBe(200);
    expect(sm.toMinorUnits({ minor: 120 })).toBe(120);
    expect(sm.toMinorUnits('')).toBeNull();
    expect(sm.toMinorUnits(null)).toBeNull();
  });

  test('quantity is a 3dp decimal (weighted goods are first-class)', () => {
    expect(sm.normalizeQty('2.5')).toBe(2.5);
    expect(sm.normalizeQty('1.125')).toBe(1.125); // 3dp preserved
    expect(sm.normalizeQty('x')).toBeNull();       // blank/non-numeric → null, never 0
    expect(sm.normalizeQty('')).toBeNull();
  });

  test('saleKey/lineKey are stable and provider-scoped (idempotency basis)', () => {
    const sale = sm.makeSale({ provider: 'square', merchantId: 'm1', saleId: 'txn_9', lines: [] });
    expect(sm.saleKey(sale)).toBe('square:m1:txn_9');
    const line = sm.makeLine({ lineId: 'L1', qty: 1, ref: { barcode: '5000' } });
    expect(sm.lineKey(sale, line)).toBe('square:m1:txn_9:L1');
  });

  test('a completed sale with matchable lines is stock-eligible', () => {
    const sale = sm.makeSale({
      provider: 'square', merchantId: 'm', saleId: 't1', status: sm.SALE_STATUS.COMPLETED,
      lines: [sm.makeLine({ lineId: '1', qty: 2, ref: { barcode: '5000001' } })],
    });
    expect(sale.issues).toEqual([]);
    expect(sm.isStockEligible(sale)).toBe(true);
  });

  test('unmatched (name-only) and bad-qty lines are flagged and block deduction', () => {
    const sale = sm.makeSale({
      provider: 'square', merchantId: 'm', saleId: 't2',
      lines: [
        sm.makeLine({ lineId: '1', qty: 1, ref: { name: 'Milk 2L' } }),   // name only → unmatched
        sm.makeLine({ lineId: '2', qty: 0, ref: { barcode: '5000002' } }), // bad qty
      ],
    });
    const codes = sale.issues.map((i) => i.code).sort();
    expect(codes).toContain('unmatched');
    expect(codes).toContain('bad_qty');
    expect(sm.isStockEligible(sale)).toBe(false); // never guesses a name match or a quantity
  });

  test('a weighted line is advisory (routes to review) but not a hard block', () => {
    const sale = sm.makeSale({
      provider: 'square', merchantId: 'm', saleId: 't3',
      lines: [sm.makeLine({ lineId: '1', qty: 0.75, unit: 'kg', ref: { barcode: '5000003' } })],
    });
    expect(sale.issues.some((i) => i.code === 'weighted')).toBe(true);
    expect(sm.isStockEligible(sale)).toBe(true);
  });

  test('refunds/returns never imply a restock by themselves', () => {
    const refunded = sm.makeSale({
      provider: 'square', merchantId: 'm', saleId: 't4', status: sm.SALE_STATUS.REFUNDED,
      lines: [sm.makeLine({ lineId: '1', qty: 1, ref: { barcode: '5000004' } })],
    });
    expect(sm.isStockEligible(refunded)).toBe(false); // a refund is not a completed sale
    const returnLine = sm.makeLine({ kind: 'return', lineId: 'r1', qty: 1, ref: { barcode: '5000004' } });
    expect(returnLine.kind).toBe(sm.LINE_KIND.RETURN); // kept distinct from a sale line
  });

  // ── Audit P2 hardening ──────────────────────────────────────────────────────
  test('an explicit unknown status does NOT fail open to completed', () => {
    const sale = sm.makeSale({
      provider: 'square', merchantId: 'm', saleId: 't5', status: 'pending',
      lines: [sm.makeLine({ lineId: '1', qty: 1, ref: { barcode: '5000005' } })],
    });
    expect(sale.status).toBe('unknown');
    expect(sale.issues.some((i) => i.code === 'bad_status')).toBe(true);
    expect(sm.isStockEligible(sale)).toBe(false);
  });

  test('an omitted status still defaults to completed (simple-import convenience)', () => {
    const sale = sm.makeSale({
      provider: 'square', merchantId: 'm', saleId: 't6',
      lines: [sm.makeLine({ lineId: '1', qty: 1, ref: { barcode: '5000006' } })],
    });
    expect(sale.status).toBe(sm.SALE_STATUS.COMPLETED);
    expect(sm.isStockEligible(sale)).toBe(true);
  });

  test('malformed quantities are rejected, not silently coerced', () => {
    expect(sm.normalizeQty('1e3')).toBeNull();   // was coerced to 13 before the fix
    expect(sm.normalizeQty('12x')).toBeNull();
    expect(sm.normalizeQty('£1.50')).toBe(1.5);  // currency symbol tolerated
    expect(sm.normalizeQty('1,000')).toBe(1000); // thousands comma tolerated
    expect(sm.normalizeQty(1000)).toBe(1000);    // a real number is fine
  });

  test('an unrecognised unit is flagged for review (not silently treated as each)', () => {
    const sale = sm.makeSale({
      provider: 'square', merchantId: 'm', saleId: 't7',
      lines: [sm.makeLine({ lineId: '1', qty: 1, unit: 'dozen', ref: { barcode: '5000007' } })],
    });
    expect(sale.issues.some((i) => i.code === 'unknown_unit')).toBe(true);
    expect(sm.isStockEligible(sale)).toBe(false);
    // a recognised unit/alias stays clean
    const ok = sm.makeSale({
      provider: 'square', merchantId: 'm', saleId: 't8',
      lines: [sm.makeLine({ lineId: '1', qty: 1, unit: 'pcs', ref: { barcode: '5000008' } })],
    });
    expect(ok.issues.some((i) => i.code === 'unknown_unit')).toBe(false);
  });
});
