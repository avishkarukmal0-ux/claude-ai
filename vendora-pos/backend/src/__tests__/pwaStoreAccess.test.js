'use strict';

// Pure, DB-free tests for role-based store access (backend-enforced staff permissions). Requiring the
// service pulls in mongoose models but opens no connection, so this runs offline in every environment.
const { canWriteStore, canReadStore, FINANCIAL_STORES } = require('../services/pwaSyncService');

describe('pwaSyncService — role-based store access', () => {
  const financial = ['takings_v1', 'claims_v1', 'credit_notes_v1', 'invoices_v1'];
  const operational = ['inventory_v1', 'deliveries_v1', 'stocktake_v1', 'tasks_v1', 'waste_v1', 'buylist_v1'];

  test('staff cannot write financial stores', () => {
    for (const s of financial) expect(canWriteStore('staff', s)).toBe(false);
  });

  test('staff can write operational stores', () => {
    for (const s of operational) expect(canWriteStore('staff', s)).toBe(true);
  });

  test('manager and owner can write everything, including financial', () => {
    for (const s of [...financial, ...operational]) {
      expect(canWriteStore('manager', s)).toBe(true);
      expect(canWriteStore('owner', s)).toBe(true);
    }
  });

  test('a legacy token with no role (undefined) is treated as the owner', () => {
    for (const s of financial) expect(canWriteStore(undefined, s)).toBe(true);
  });

  test('read access mirrors write access for financial stores', () => {
    for (const s of financial) {
      expect(canReadStore('staff', s)).toBe(false);
      expect(canReadStore('manager', s)).toBe(true);
    }
    for (const s of operational) expect(canReadStore('staff', s)).toBe(true);
  });

  test('FINANCIAL_STORES is exactly the money set', () => {
    expect([...FINANCIAL_STORES].sort()).toEqual([...financial].sort());
  });
});
