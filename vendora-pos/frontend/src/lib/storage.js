// Storage foundation for the PWA — the one place that talks to localStorage.
//
// Why this exists (see obsidian-vault Work-Log 2026-09-30):
//  1. WORKSPACE SCOPING. Every key is namespaced to a workspace so guest/demo data
//     and each authenticated shop's data stay separate on the device. Legacy builds
//     wrote bare keys like `vendora_inventory_v1` with no shop identity — dangerous
//     once more than one shop uses a device.
//  2. VISIBLE FAILURES. Writes report success/failure and emit an event so the UI can
//     surface "couldn't save" instead of silently losing data (old code swallowed it).
//  3. SAFE MIGRATION. Legacy unscoped keys are copied ONCE into the guest ('local')
//     workspace, non-destructively (the originals are kept as a safety net). We never
//     silently attach on-device data to whichever shop account logs in next — moving
//     guest data into a shop is an explicit, user-controlled action (copyWorkspace).
//
// Framework-free on purpose so it is unit-testable without React.

const NS = 'vendora';
const ACTIVE_KEY = `${NS}:active_workspace`;
const MIGRATED_FLAG = `${NS}:legacy_migrated_v1`;

export const LOCAL_WORKSPACE = 'local'; // the guest / on-device (no account) workspace

// Logical store names (stable). Scoped key = `vendora:<workspace>:<name>`.
// Legacy (pre-scoping) key = `vendora_<name>`.
export const STORE_NAMES = [
  'shop_type',
  'inventory_v1',
  'suppliers_v1',
  'buylist_v1',
  'waste_v1',
  'takings_v1',
  'movements_v1',
  'suggestions_v1',
  'stocktake_v1',
  'stocktake_history_v1',
  'deliveries_v1',
  'orders_v1',
  'claims_v1',
  'price_alerts_v1',
  'tasks_v1',
  'handovers_v1',
];

export const WORKSPACE_EVENT = 'vendora:workspace';
export const STORAGE_ERROR_EVENT = 'vendora:storage-error';

function dispatch(name, detail) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* non-browser */ }
}

function legacyKey(name) { return `${NS}_${name}`; }
export function keyFor(name, ws) { return `${NS}:${ws}:${name}`; }

// --- workspace -------------------------------------------------------------
let _active = null;

export function getActiveWorkspace() {
  if (_active) return _active;
  try { _active = localStorage.getItem(ACTIVE_KEY) || LOCAL_WORKSPACE; }
  catch { _active = LOCAL_WORKSPACE; }
  return _active;
}

export function setActiveWorkspace(ws) {
  _active = ws || LOCAL_WORKSPACE;
  try { localStorage.setItem(ACTIVE_KEY, _active); } catch { /* ignore */ }
  dispatch(WORKSPACE_EVENT, { workspace: _active });
  return _active;
}

/** A shop workspace id from a stable shop/account id. */
export function shopWorkspace(shopId) {
  return shopId ? `shop:${String(shopId)}` : LOCAL_WORKSPACE;
}

// --- safe read/write -------------------------------------------------------
function describeError(e) {
  if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
    return 'This device is out of storage space. Free some space or export a backup, then try again.';
  }
  return 'Couldn’t save to this device. Your last change may not be stored.';
}

/** Raw string read for the active (or given) workspace. */
export function read(name, fallback = null, ws = getActiveWorkspace()) {
  try {
    const raw = localStorage.getItem(keyFor(name, ws));
    return raw == null ? fallback : raw;
  } catch {
    return fallback;
  }
}

export function readJSON(name, fallback = null, ws = getActiveWorkspace()) {
  const raw = read(name, null, ws);
  if (raw == null) return fallback;
  try {
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

/** Write a raw string. Returns { ok, error? } and emits STORAGE_ERROR_EVENT on failure. */
export function write(name, value, ws = getActiveWorkspace()) {
  try {
    localStorage.setItem(keyFor(name, ws), value);
    return { ok: true };
  } catch (e) {
    const error = describeError(e);
    dispatch(STORAGE_ERROR_EVENT, { name, error });
    return { ok: false, error };
  }
}

export function writeJSON(name, value, ws = getActiveWorkspace()) {
  let s;
  try { s = JSON.stringify(value); }
  catch { return { ok: false, error: 'Couldn’t prepare data to save.' }; }
  return write(name, s, ws);
}

export function removeKey(name, ws = getActiveWorkspace()) {
  try { localStorage.removeItem(keyFor(name, ws)); return { ok: true }; }
  catch (e) { return { ok: false, error: describeError(e) }; }
}

/** The concrete localStorage key names for a workspace (used by backup). */
export function scopedKeyMap(ws = getActiveWorkspace()) {
  const map = {};
  for (const name of STORE_NAMES) map[name] = keyFor(name, ws);
  return map;
}

// --- migration -------------------------------------------------------------
/**
 * One-time, non-destructive copy of legacy unscoped keys into the guest workspace.
 * Safe because the guest workspace has no account identity — this is the same device's
 * own data, just namespaced. Originals are retained. Runs at most once (guarded).
 * @returns { migrated: number, ran: boolean }
 */
export function migrateLegacyToLocalOnce() {
  try {
    if (localStorage.getItem(MIGRATED_FLAG)) return { migrated: 0, ran: false };
    let migrated = 0;
    for (const name of STORE_NAMES) {
      const scoped = keyFor(name, LOCAL_WORKSPACE);
      if (localStorage.getItem(scoped) != null) continue; // don't clobber scoped data
      const legacy = localStorage.getItem(legacyKey(name));
      if (legacy != null) { localStorage.setItem(scoped, legacy); migrated++; }
    }
    localStorage.setItem(MIGRATED_FLAG, '1');
    return { migrated, ran: true };
  } catch (e) {
    return { migrated: 0, ran: false, error: describeError(e) };
  }
}

/** True if any legacy unscoped data still exists on the device. */
export function hasLegacyData() {
  try {
    return STORE_NAMES.some((name) => localStorage.getItem(legacyKey(name)) != null);
  } catch { return false; }
}

/** True if a workspace holds any of our data. */
export function workspaceHasData(ws) {
  try { return STORE_NAMES.some((name) => localStorage.getItem(keyFor(name, ws)) != null); }
  catch { return false; }
}

/**
 * EXPLICIT, user-controlled copy of one workspace's data into another (e.g. move guest
 * data into a shop you just logged into). Never runs automatically. By default it will
 * NOT overwrite existing data in the destination.
 * @returns { copied, skipped, error? }
 */
export function copyWorkspace(from, to, { overwrite = false } = {}) {
  const report = { copied: 0, skipped: 0 };
  if (!from || !to || from === to) return { ...report, error: 'Invalid workspaces' };
  try {
    for (const name of STORE_NAMES) {
      const src = localStorage.getItem(keyFor(name, from));
      if (src == null) continue;
      const destKey = keyFor(name, to);
      if (!overwrite && localStorage.getItem(destKey) != null) { report.skipped++; continue; }
      localStorage.setItem(destKey, src);
      report.copied++;
    }
    return report;
  } catch (e) {
    return { ...report, error: describeError(e) };
  }
}

/** Subscribe a callback to workspace switches + cross-tab writes. Returns an unsubscribe. */
export function onWorkspaceChange(cb) {
  const handler = () => cb();
  window.addEventListener(WORKSPACE_EVENT, handler);
  return () => window.removeEventListener(WORKSPACE_EVENT, handler);
}
