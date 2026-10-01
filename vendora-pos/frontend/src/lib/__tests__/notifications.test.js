import {
  describe, it, expect, beforeEach,
} from 'vitest';
import {
  summarise, shouldShow, digestLine, getDevicePrefs, setDevicePrefs, DEFAULT_DEVICE_PREFS,
} from '../notifications';

// A fixed "today" so expiry maths is deterministic.
const NOW = new Date(2026, 9, 1, 9, 0, 0).getTime(); // 1 Oct 2026, 09:00 local
const iso = (d) => { const x = new Date(NOW + d * 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

describe('notifications — summarise (device digest, pure)', () => {
  it('flags expiring stock, overdue claims and urgent tasks', () => {
    const d = summarise({
      products: [
        { name: 'Milk', qty: 5, expiry: iso(1) },        // in 1 day
        { name: 'Yoghurt', qty: 2, expiry: iso(-1) },     // expired
        { name: 'Rice', qty: 9, expiry: iso(30) },        // far → excluded
      ],
      claims: [
        { status: 'submitted', supplierName: 'Bestway', requestedAmount: 15, followUpDate: iso(-2) }, // overdue
        { status: 'settled', supplierName: 'Booker', requestedAmount: 50, followUpDate: iso(-5) },     // closed
      ],
      tasks: [
        { title: 'Clean chiller', status: 'open', priority: 'high' },
        { title: 'Later', status: 'open', priority: 'normal' }, // not urgent
      ],
      prefs: { ...DEFAULT_DEVICE_PREFS, expiryDays: 3 },
      now: NOW,
    });
    expect(d.expiring.map((x) => x.name)).toEqual(['Yoghurt', 'Milk']); // soonest first
    expect(d.overdueClaims).toHaveLength(1);
    expect(d.urgentTasks).toHaveLength(1);
    expect(d.empty).toBe(false);
    expect(digestLine(d)).toContain('expiring');
  });

  it('honours category toggles and reports empty', () => {
    const d = summarise({
      products: [{ name: 'Milk', qty: 5, expiry: iso(1) }],
      claims: [], tasks: [],
      prefs: { ...DEFAULT_DEVICE_PREFS, categories: { expiry: false, claims: true, tasks: true } },
      now: NOW,
    });
    expect(d.expiring).toHaveLength(0);
    expect(d.empty).toBe(true);
    expect(digestLine(d)).toBe('All clear');
  });
});

describe('notifications — shouldShow (pure)', () => {
  const base = { ...DEFAULT_DEVICE_PREFS, enabled: true, sendHour: 7, quietFrom: 21, quietTo: 7, lastShownDay: '' };
  it('false unless enabled and permission granted', () => {
    expect(shouldShow({ ...base, enabled: false }, NOW, 'granted')).toBe(false);
    expect(shouldShow(base, NOW, 'denied')).toBe(false);
  });
  it('true in the morning window, once per day', () => {
    expect(shouldShow(base, NOW, 'granted')).toBe(true);
  });
  it('false before the send hour', () => {
    const early = new Date(2026, 9, 1, 5, 0, 0).getTime();
    expect(shouldShow(base, early, 'granted')).toBe(false);
  });
  it('false during quiet hours and while snoozed', () => {
    const night = new Date(2026, 9, 1, 22, 30, 0).getTime();
    expect(shouldShow(base, night, 'granted')).toBe(false);
    expect(shouldShow({ ...base, snoozeUntil: NOW + 60000 }, NOW, 'granted')).toBe(false);
  });
});

describe('notifications — device prefs persistence', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips through localStorage with defaults', () => {
    expect(getDevicePrefs().enabled).toBe(false);
    setDevicePrefs({ enabled: true, sendHour: 8 });
    const p = getDevicePrefs();
    expect(p.enabled).toBe(true);
    expect(p.sendHour).toBe(8);
    expect(p.categories.expiry).toBe(true); // default preserved
  });
});
