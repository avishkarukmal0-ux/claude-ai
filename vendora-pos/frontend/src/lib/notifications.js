// Device (PWA) notifications — the on-device half of the daily digest (mandate #6).
//
// Honest split of responsibilities:
//  - EMAIL is the reliable, not-app-open-dependent channel; the server computes + sends it (prefs live on
//    the account, edited via notifyClient).
//  - DEVICE notifications (this module) are a best-effort convenience: the browser can only raise them
//    while it can run, so we compute the same digest locally and show it when the app is opened in the
//    send window. Permission is requested explicitly from the UI and denial is handled gracefully.
//
// Device preferences are per-device (NOT synced, NOT part of a backup) — a phone and a back-office tablet
// can want different reminders.
import { readJSON } from './storage';
import { recordFailure } from './diagnostics';
import { worstExpiry } from './inventoryStore';
import { OPEN_CLAIM_STATUSES } from './claimStore';
import { claimOutstanding } from './creditNoteStore';
import { OPEN_TASK_STATUSES } from './taskStore';

const DEVICE_KEY = 'vendora:notify-device'; // device-global, not workspace-scoped, not synced

export const DEFAULT_DEVICE_PREFS = {
  enabled: false,
  categories: { expiry: true, claims: true, tasks: true },
  expiryDays: 3,
  sendHour: 7,
  quietFrom: 21,
  quietTo: 7,
  snoozeUntil: 0,
  lastShownDay: '',
};

export function getDevicePrefs() {
  try { const r = localStorage.getItem(DEVICE_KEY); return { ...DEFAULT_DEVICE_PREFS, ...(r ? JSON.parse(r) : {}) }; }
  catch { return { ...DEFAULT_DEVICE_PREFS }; }
}
export function setDevicePrefs(patch) {
  const next = { ...getDevicePrefs(), ...patch };
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

// --- permission (graceful) --------------------------------------------------
export function notificationSupported() {
  try { return typeof window !== 'undefined' && 'Notification' in window; } catch { return false; }
}
export function permissionState() {
  if (!notificationSupported()) return 'unsupported';
  try { return Notification.permission; } catch { return 'unsupported'; }
}
/** Ask for permission. Returns 'granted' | 'denied' | 'unsupported'. Never throws. */
export async function ensurePermission() {
  if (!notificationSupported()) return 'unsupported';
  try {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    const res = await Notification.requestPermission();
    return res || 'denied';
  } catch { return 'denied'; }
}

// --- digest (pure) ----------------------------------------------------------
function dayKey(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Compute the digest from in-memory arrays. Pure + testable. Mirrors the server digest so the two channels
 * say the same thing.
 */
export function summarise({ products = [], claims = [], tasks = [], prefs = DEFAULT_DEVICE_PREFS, now = Date.now() } = {}) {
  const cats = prefs.categories || DEFAULT_DEVICE_PREFS.categories;
  const expiryDays = Number.isFinite(prefs.expiryDays) ? prefs.expiryDays : 3;
  const from = new Date(now);

  const expiring = [];
  if (cats.expiry !== false) {
    for (const p of products) {
      const ei = worstExpiry(p, from);
      if (ei && ei.daysLeft != null && ei.daysLeft <= expiryDays) expiring.push({ name: p.name || 'Item', days: ei.daysLeft });
    }
    expiring.sort((a, b) => a.days - b.days);
  }

  const overdueClaims = [];
  if (cats.claims !== false) {
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    for (const c of claims) {
      const open = OPEN_CLAIM_STATUSES.includes(c.status);
      const due = c.followUpDate && new Date(c.followUpDate).setHours(0, 0, 0, 0) < today.getTime();
      if (open && due) overdueClaims.push({ supplierName: c.supplierName || 'Supplier', outstanding: claimOutstanding(c) });
    }
  }

  const urgentTasks = [];
  if (cats.tasks !== false) {
    for (const t of tasks) {
      const open = OPEN_TASK_STATUSES.includes(t.status);
      const overdue = t.dueAt && Number(t.dueAt) < now;
      if (open && (t.priority === 'high' || overdue)) urgentTasks.push({ title: t.title || 'Task', overdue: !!overdue });
    }
  }

  const empty = !expiring.length && !overdueClaims.length && !urgentTasks.length;
  return { expiring, overdueClaims, urgentTasks, empty };
}

/** One-line body for the device notification. */
export function digestLine(d) {
  const bits = [];
  if (d.expiring.length) bits.push(`${d.expiring.length} expiring`);
  if (d.overdueClaims.length) bits.push(`${d.overdueClaims.length} claim${d.overdueClaims.length === 1 ? '' : 's'} to chase`);
  if (d.urgentTasks.length) bits.push(`${d.urgentTasks.length} urgent task${d.urgentTasks.length === 1 ? '' : 's'}`);
  return bits.join(' · ') || 'All clear';
}

/** Read the shop's stores and build the digest. */
export function buildLocalDigest(now = Date.now(), prefs = getDevicePrefs()) {
  return summarise({
    products: readJSON('inventory_v1', []),
    claims: readJSON('claims_v1', []),
    tasks: readJSON('tasks_v1', []),
    prefs, now,
  });
}

// --- due logic (pure) -------------------------------------------------------
/** Should we show a device notification now? (enabled + permission + window + quiet + snooze + once/day). */
export function shouldShow(prefs, now = Date.now(), permission = permissionState()) {
  if (!prefs.enabled) return false;
  if (permission !== 'granted') return false;
  if (prefs.snoozeUntil && now < Number(prefs.snoozeUntil)) return false;
  const hour = new Date(now).getHours();
  const qFrom = Number.isFinite(prefs.quietFrom) ? prefs.quietFrom : 21;
  const qTo = Number.isFinite(prefs.quietTo) ? prefs.quietTo : 7;
  const inQuiet = qFrom === qTo ? false : qFrom < qTo ? (hour >= qFrom && hour < qTo) : (hour >= qFrom || hour < qTo);
  if (inQuiet) return false;
  const sendHour = Number.isFinite(prefs.sendHour) ? prefs.sendHour : 7;
  if (hour < sendHour) return false;
  if (prefs.lastShownDay === dayKey(now)) return false;
  return true;
}

// --- show -------------------------------------------------------------------
async function raise(title, body) {
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) { await reg.showNotification(title, { body, tag: 'vendora-digest', icon: '/icon-192.png', badge: '/icon-192.png' }); return true; }
    }
  } catch { /* fall through to page notification */ }
  try { new Notification(title, { body, tag: 'vendora-digest' }); return true; } catch { return false; }
}

/**
 * The opportunistic entry point — call on app open / resume. Shows at most one digest per day, only in the
 * send window, only if something needs attention. Returns what it did (for tests / telemetry).
 */
export async function maybeNotify(now = Date.now()) {
  const prefs = getDevicePrefs();
  if (!shouldShow(prefs, now)) return { shown: false, reason: 'not_due' };
  const digest = buildLocalDigest(now, prefs);
  // Mark the day handled either way so an empty day doesn't keep re-checking; but don't nag if empty.
  setDevicePrefs({ lastShownDay: dayKey(now) });
  if (digest.empty) return { shown: false, reason: 'nothing_to_show' };
  const ok = await raise('Vendora — today’s summary', digestLine(digest));
  if (!ok) { try { recordFailure('reminder', 'device notification not shown'); } catch { /* ignore */ } }
  return { shown: ok, reason: ok ? 'shown' : 'show_failed', digest };
}
