// Storage foundation for the PWA — the one place that talks to on-device storage.
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
//  4. DURABILITY (infra Stage 1, 2026-09-30). localStorage has a ~5MB cap, no transactions,
//     and is evicted first under storage pressure. We keep the fast SYNCHRONOUS API the whole
//     app relies on, backed by an in-memory cache (MEM), and mirror every write to IndexedDB
//     (large, transactional, resilient). On boot, initStorage() restores anything missing from
//     localStorage out of IndexedDB — so data survives eviction and can exceed the 5MB cap.
//     If IndexedDB is unavailable, everything degrades to exactly the previous localStorage-only
//     behaviour.
//
// Framework-free on purpose so it is unit-testable without React.

import * as idb from './idb';

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
  'requests_v1',
  'sales_imports_v1',
];

export const WORKSPACE_EVENT = 'vendora:workspace';
export const STORAGE_ERROR_EVENT = 'vendora:storage-error';

function dispatch(name, detail) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* non-browser */ }
}

function legacyKey(name) { return `${NS}_${name}`; }
export function keyFor(name, ws) { return `${NS}:${ws}:${name}`; }

// --- in-memory cache + durable (IndexedDB) backing ------------------------
// MEM is the synchronous working copy keyed by FULL storage key. It is seeded lazily from
// localStorage and restored from IndexedDB on boot (initStorage). The public read/write API
// below operates through MEM so it stays synchronous and deterministic (read-after-write is
// always correct), while durability is mirrored to localStorage AND IndexedDB.
const MEM = new Map();
let _durable = idb;            // pluggable so unit tests can inject a fake backend

// Device-level session/credential keys that must NEVER be mirrored to IndexedDB. Auth is stored in
// localStorage only (see account.js); mirroring it to IDB meant a logout that cleared localStorage was
// silently restored from IDB on the next boot (audit F1). These keys are never seeded, never restored,
// and are purged from IDB on init.
const NEVER_DURABLE = new Set([`${NS}:auth`]);

function durableOn() {
  try { return !!(_durable && _durable.available && _durable.available()); }
  catch { return false; }
}
function durableSet(fullKey, value) {
  if (!durableOn() || NEVER_DURABLE.has(fullKey)) return;
  try { _durable.set(fullKey, value).catch(() => {}); } catch { /* ignore */ }
}
function durableDel(fullKey) {
  if (!durableOn()) return;
  try { _durable.del(fullKey).catch(() => {}); } catch { /* ignore */ }
}
/** Synchronous read of a full key: MEM first, else lazily hydrate from localStorage. */
function memGet(fullKey) {
  if (MEM.has(fullKey)) return MEM.get(fullKey);
  let ls = null;
  try { ls = localStorage.getItem(fullKey); } catch { ls = null; }
  if (ls != null) MEM.set(fullKey, ls);
  return ls;
}

/** Inject a durable backend (tests). Pass nothing to restore the real IndexedDB one. */
export function __setDurableBackend(backend) { _durable = backend || idb; }
/** Clear the in-memory cache (tests). */
export function __resetMemForTest() { MEM.clear(); }

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
  const raw = memGet(keyFor(name, ws));
  return raw == null ? fallback : raw;
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

/**
 * Write a raw string. Returns { ok, error? } and emits STORAGE_ERROR_EVENT on failure.
 * Durability: commits to MEM (sync), localStorage (best-effort sync), and IndexedDB (async).
 * If localStorage is full BUT IndexedDB is available, the write still succeeds (durable via
 * IndexedDB, and marked `overflow`) instead of being lost.
 */
export function write(name, value, ws = getActiveWorkspace()) {
  const fullKey = keyFor(name, ws);
  let lsOk = true;
  let lsErr = null;
  try { localStorage.setItem(fullKey, value); }
  catch (e) { lsOk = false; lsErr = e; }

  if (lsOk) {
    MEM.set(fullKey, value);
    durableSet(fullKey, value);
    return { ok: true };
  }
  if (durableOn()) {
    // localStorage rejected it (usually quota) but IndexedDB can hold it — not a data loss.
    MEM.set(fullKey, value);
    durableSet(fullKey, value);
    return { ok: true, overflow: true };
  }
  const error = describeError(lsErr);
  dispatch(STORAGE_ERROR_EVENT, { name, error });
  return { ok: false, error };
}

export function writeJSON(name, value, ws = getActiveWorkspace()) {
  let s;
  try { s = JSON.stringify(value); }
  catch { return { ok: false, error: 'Couldn’t prepare data to save.' }; }
  return write(name, s, ws);
}

export function removeKey(name, ws = getActiveWorkspace()) {
  const fullKey = keyFor(name, ws);
  MEM.delete(fullKey);
  durableDel(fullKey);
  try { localStorage.removeItem(fullKey); return { ok: true }; }
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
      if (legacy != null) {
        localStorage.setItem(scoped, legacy);
        MEM.set(scoped, legacy);
        durableSet(scoped, legacy);
        migrated++;
      }
    }
    localStorage.setItem(MIGRATED_FLAG, '1');
    return { migrated, ran: true };
  } catch (e) {
    return { migrated: 0, ran: false, error: describeError(e) };
  }
}

/** True if ANY of our data is already present in localStorage (used to decide whether boot must
 *  wait for IndexedDB recovery). Fast + synchronous. */
export function hasAnyLocalData() {
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.indexOf(`${NS}:`) === 0 && k !== ACTIVE_KEY && k !== MIGRATED_FLAG) return true;
    }
  } catch { /* ignore */ }
  return false;
}

/** True if any legacy unscoped data still exists on the device. */
export function hasLegacyData() {
  try {
    return STORE_NAMES.some((name) => localStorage.getItem(legacyKey(name)) != null);
  } catch { return false; }
}

/** True if a workspace holds any of our data (checks MEM + localStorage, so overflow counts). */
export function workspaceHasData(ws) {
  return STORE_NAMES.some((name) => memGet(keyFor(name, ws)) != null);
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
      const src = memGet(keyFor(name, from));
      if (src == null) continue;
      if (!overwrite && memGet(keyFor(name, to)) != null) { report.skipped++; continue; }
      const res = write(name, src, to);
      if (res.ok) report.copied++;
      else return { ...report, error: res.error };
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

// --- durable init / recovery ----------------------------------------------
let _initPromise = null;

/**
 * Boot-time durability sync (safe to call once at startup; idempotent). If IndexedDB is available:
 *  1) SEED — copy any existing on-device (localStorage) `vendora:` keys into IndexedDB it doesn't
 *     already have, so IndexedDB becomes a durable mirror for existing users (the migration).
 *  2) RESTORE — for any key present in IndexedDB but missing from localStorage (evicted, or too big
 *     to fit), load it back into the in-memory cache (and localStorage where it fits), then fire a
 *     workspace event so live hooks re-read. localStorage stays authoritative when it has the key,
 *     so this only ever fills gaps — it never overwrites newer on-device data.
 * Non-destructive throughout. Returns { ran, seeded, restored }.
 */
export function initStorage() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    if (!durableOn()) return { ran: false, seeded: 0, restored: 0 };
    let snapshot;
    try { snapshot = await _durable.getAll(); }
    catch { return { ran: false, seeded: 0, restored: 0 }; }
    const idbKeys = new Set(snapshot.map((r) => r.key));

    // 0) Purge any credential/session keys that were mirrored to IndexedDB by earlier builds — they
    //    must live in localStorage only, so a logout can't be undone by a durable restore (audit F1).
    for (const k of NEVER_DURABLE) { if (idbKeys.has(k)) { durableDel(k); } }

    // 1) Seed IndexedDB from existing localStorage keys it lacks (never session/credential keys).
    let seeded = 0;
    try {
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(`${NS}:`) !== 0 || idbKeys.has(k) || NEVER_DURABLE.has(k)) continue;
        const v = localStorage.getItem(k);
        if (v != null) { durableSet(k, v); seeded += 1; }
      }
    } catch { /* ignore */ }

    // 2) Restore IndexedDB keys missing from localStorage (recovery of evicted/overflow data).
    let restored = 0;
    for (const { key, value } of snapshot) {
      if (typeof key !== 'string' || key.indexOf(`${NS}:`) !== 0 || NEVER_DURABLE.has(key)) continue;
      let ls = null;
      try { ls = localStorage.getItem(key); } catch { ls = null; }
      if (ls == null && !MEM.has(key)) {
        MEM.set(key, value);
        try { localStorage.setItem(key, value); } catch { /* overflow: keep in MEM only */ }
        restored += 1;
      }
    }
    if (restored) {
      _active = null; // active-workspace key may have been restored — re-read it lazily
      dispatch(WORKSPACE_EVENT, { restored });
    }
    return { ran: true, seeded, restored };
  })();
  return _initPromise;
}

/** Test hook: allow initStorage to run again. */
export function __resetInitForTest() { _initPromise = null; }
