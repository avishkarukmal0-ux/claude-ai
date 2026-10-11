'use strict';

// Audit B2 (round 2): canonical-rev selection. These cover the PURE selection logic (no DB). The atomic
// nextRev() counter + concurrent-upload survival are exercised by the DB-gated pwaDoc/pwaImage integration
// suites against a real Mongo in CI.
const { pickLatest, revOf } = require('../services/backupRev');

const file = (id, rev) => ({ _id: id, metadata: rev === undefined ? {} : { rev } });

describe('backupRev.revOf', () => {
  test('reads metadata.rev, defaults legacy/missing to 0', () => {
    expect(revOf(file('a', 5))).toBe(5);
    expect(revOf(file('a'))).toBe(0);           // legacy (no rev)
    expect(revOf({ _id: 'a' })).toBe(0);        // no metadata
    expect(revOf(file('a', 'x'))).toBe(0);      // non-numeric
  });
});

describe('backupRev.pickLatest — highest rev wins (not greatest _id)', () => {
  test('null/empty', () => {
    expect(pickLatest(null)).toBe(null);
    expect(pickLatest([])).toBe(null);
  });

  test('highest rev wins even when its _id string-sorts LOWER (the B2 cross-process case)', () => {
    // 'a...' < 'z...' as strings, but the newer upload (higher rev) has the smaller _id.
    const older = file('zzz_oldbytes', 7);
    const newer = file('aaa_newbytes', 8);
    expect(pickLatest([older, newer])._id).toBe('aaa_newbytes');
    expect(pickLatest([newer, older])._id).toBe('aaa_newbytes'); // order-independent
  });

  test('a real rev (>=1) always beats a legacy rev-0 file regardless of _id', () => {
    const legacy = file('zzzzzz', undefined); // rev 0, large _id
    const real = file('aaaaaa', 1);
    expect(pickLatest([legacy, real])._id).toBe('aaaaaa');
  });

  test('equal rev (e.g. two legacy rev-0) falls back to greatest _id (stable)', () => {
    expect(pickLatest([file('a'), file('b')])._id).toBe('b');
    expect(pickLatest([file('a', 3), file('b', 3)])._id).toBe('b');
  });
});
