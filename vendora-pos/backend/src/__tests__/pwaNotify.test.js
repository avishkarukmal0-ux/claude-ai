'use strict';

// Pure, DB-free tests for the PWA digest (mandate #6). Requiring the service loads models but opens no
// connection, so this runs offline everywhere.
const {
  buildDigest, isDue, londonParts, digestToText, emailConfigured,
} = require('../services/pwaNotifyService');

const NOW = new Date('2026-10-01T08:00:00Z').getTime(); // 09:00 Europe/London (BST)

function blobs() {
  return {
    inventory_v1: JSON.stringify([
      { name: 'Milk', qty: 6, expiry: '2026-10-02' },            // in ~1 day
      { name: 'Bread', qty: 3, batches: [{ qty: 3, expiry: '2026-09-30' }] }, // past
      { name: 'Beans', qty: 10, expiry: '2026-12-01' },          // far off → excluded
    ]),
    claims_v1: JSON.stringify([
      { status: 'submitted', supplierName: 'Bestway', requestedAmount: 20, followUpDate: '2026-09-28' }, // overdue
      { status: 'settled', supplierName: 'Booker', requestedAmount: 99, followUpDate: '2026-09-01' },    // closed → excluded
    ]),
    tasks_v1: JSON.stringify([
      { title: 'Fix freezer', status: 'open', priority: 'high' }, // urgent
      { title: 'Old thing', status: 'open', priority: 'normal', dueAt: NOW - 1000 }, // overdue
      { title: 'Done', status: 'done', priority: 'high' },        // closed → excluded
    ]),
  };
}

describe('pwaNotifyService — buildDigest', () => {
  it('summarises expiring stock, overdue claims and urgent tasks', () => {
    const d = buildDigest({ shopName: 'Corner', blobsByName: blobs(), prefs: { expiryDays: 3 }, now: NOW });
    expect(d.empty).toBe(false);
    expect(d.expiry.count).toBe(2);           // Milk + Bread, not Beans
    expect(d.claims.count).toBe(1);           // only the open, overdue one
    expect(d.claims.outstanding).toBe(20);
    expect(d.tasks.count).toBe(2);            // high + overdue, not the done one
    expect(d.expiry.items[0].days).toBeLessThanOrEqual(d.expiry.items[1].days); // soonest first
  });

  it('respects category toggles', () => {
    const d = buildDigest({ shopName: 'Corner', blobsByName: blobs(), prefs: { expiryDays: 3, categories: { expiry: false, claims: true, tasks: false } }, now: NOW });
    expect(d.expiry.count).toBe(0);
    expect(d.tasks.count).toBe(0);
    expect(d.claims.count).toBe(1);
  });

  it('is empty when nothing needs attention', () => {
    const d = buildDigest({ shopName: 'Quiet', blobsByName: { inventory_v1: '[]', claims_v1: '[]', tasks_v1: '[]' }, prefs: {}, now: NOW });
    expect(d.empty).toBe(true);
    expect(digestToText(d)).toMatch(/Nothing needs your attention/);
  });

  it('tolerates missing or corrupt blobs', () => {
    const d = buildDigest({ shopName: 'X', blobsByName: { inventory_v1: 'not json', claims_v1: null }, prefs: {}, now: NOW });
    expect(d.empty).toBe(true);
  });
});

describe('pwaNotifyService — isDue', () => {
  const base = { email: { enabled: true }, sendHour: 7, quietFrom: 21, quietTo: 7, lastSentDay: '' };

  it('is false when disabled', () => { expect(isDue({ ...base, email: { enabled: false } }, NOW)).toBe(false); });
  it('is true in the send window on a fresh day', () => { expect(isDue(base, NOW)).toBe(true); });
  it('is false once already sent today', () => {
    expect(isDue({ ...base, lastSentDay: londonParts(NOW).day }, NOW)).toBe(false);
  });
  it('is false before the send hour', () => {
    const early = new Date('2026-10-01T04:30:00Z').getTime(); // 05:30 London
    expect(isDue({ ...base, sendHour: 7 }, early)).toBe(false);
  });
  it('is false during quiet hours', () => {
    const night = new Date('2026-10-01T21:30:00Z').getTime(); // 22:30 London
    expect(isDue({ ...base, sendHour: 7, quietFrom: 21, quietTo: 7 }, night)).toBe(false);
  });
  it('is false while snoozed', () => {
    expect(isDue({ ...base, snoozeUntil: NOW + 60000 }, NOW)).toBe(false);
  });
});

describe('pwaNotifyService — emailConfigured', () => {
  it('is false with no provider configured (default test env)', () => {
    expect(emailConfigured()).toBe(false);
  });
});
