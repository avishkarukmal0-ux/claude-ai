import { describe, it, expect, beforeEach } from 'vitest';
import { now, noteServerDate, clockOffset, __resetClock } from '../syncClock';

beforeEach(() => __resetClock());

describe('syncClock — server-corrected time for merge/tombstone timestamps', () => {
  it('with no server date, offset is 0 and now() ≈ Date.now()', () => {
    expect(clockOffset()).toBe(0);
    expect(Math.abs(now() - Date.now())).toBeLessThan(50);
  });

  it('a server clock AHEAD of the device shifts now() forward', () => {
    noteServerDate(new Date(Date.now() + 3600_000).toUTCString()); // server 1h ahead
    expect(clockOffset()).toBeGreaterThan(3_000_000);
    expect(now()).toBeGreaterThan(Date.now() + 3_000_000);
  });

  it('a server clock BEHIND the device shifts now() back — a fast phone no longer always wins', () => {
    noteServerDate(new Date(Date.now() - 3600_000).toUTCString()); // server 1h behind this fast device
    expect(clockOffset()).toBeLessThan(-3_000_000);
    expect(now()).toBeLessThan(Date.now());
  });

  it('ignores a missing or unparseable Date header', () => {
    noteServerDate(null);
    noteServerDate('not a date');
    expect(clockOffset()).toBe(0);
  });
});
