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

// Audit B4 (round 2): a failure LOADING/BUILDING the digest after the atomic day-claim must RELEASE the claim,
// else the day is marked sent with zero messages and the next sweep skips it.
describe('pwaNotifyService — B4 round 2: release the day-claim on a build/load failure', () => {
  const OLD = { provider: process.env.NOTIFY_EMAIL_PROVIDER, key: process.env.SENDGRID_API_KEY };
  afterEach(() => {
    process.env.NOTIFY_EMAIL_PROVIDER = OLD.provider; process.env.SENDGRID_API_KEY = OLD.key;
    jest.resetModules(); jest.restoreAllMocks();
  });

  it('releases lastSentDay when the digest data load throws', async () => {
    jest.resetModules();
    process.env.NOTIFY_EMAIL_PROVIDER = 'sendgrid';
    process.env.SENDGRID_API_KEY = 'test-key';
    const svc = require('../services/pwaNotifyService');
    const Account = require('../models/Account');
    const SyncBlob = require('../models/SyncBlob');
    const updateSpy = jest.spyOn(Account, 'updateOne').mockResolvedValue({ modifiedCount: 1 }); // claim wins + release
    jest.spyOn(SyncBlob, 'find').mockReturnValue({ lean: () => Promise.reject(new Error('db down')) });

    const account = { _id: 'acc-b4', shopName: 'Shop', email: 'o@x.com',
      notify: { email: { enabled: true }, sendHour: 0, quietFrom: 0, quietTo: 0, lastSentDay: null } };
    const res = await svc.runForAccount(account, Date.now());

    expect(res.sent).toBe(false);
    expect(res.reason).toBe('build_failed');
    // Two updateOne calls: the claim, THEN the release (lastSentDay back to null).
    const release = updateSpy.mock.calls.find((c) => c[1] && c[1].$set && c[1].$set['notify.lastSentDay'] === null);
    expect(release).toBeTruthy();
  });
});

// Audit B5 (round 2): the From address reads config.notify (the real key) — the old config.notifications was a
// typo that made the branch dead, so it only ever worked through the env fallbacks.
describe('emailService.fromAddress — B5 round 2: reads config.notify', () => {
  it('config.notifications does not exist; config.notify.from does', () => {
    const config = require('../config');
    expect(config.notifications).toBeUndefined();
    expect(config.notify && typeof config.notify.from).toBe('string');
  });
  it('an explicit from still wins; otherwise the configured default is used', () => {
    const { fromAddress } = require('../services/emailService');
    expect(fromAddress('x@shop.com')).toBe('x@shop.com');
    expect(fromAddress()).toBe(require('../config').notify.from);
  });
});
