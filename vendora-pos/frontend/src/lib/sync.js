// Cross-device sync engine (infra Stage 3).
//
// The PWA is local-first: every store is a JSON string kept on-device (see storage.js). This engine
// mirrors the signed-in shop's stores to the backend (/api/pwa-sync) so the same shop opens with the
// same data on another device. It never blocks the UI — the local copy is always authoritative for
// reads; sync happens in the background and reconciles.
//
// Model (matches pwaSyncService.js):
//  - Each store carries a server revision (`rev`) and the client's last-modified time (`mtime`), kept
//    in a per-workspace sync-meta record (NOT itself synced, NOT backed up).
//  - PULL adopts any store the server has at a higher rev than we've seen.
//  - PUSH sends locally-changed ("dirty") stores; the server fast-forwards when our baseRev matches,
//    and resolves a genuine concurrent edit last-write-wins by mtime, returning the loser as a conflict
//    for us to adopt.
//  - FIRST sync of a device for a shop is a SAFE BOOTSTRAP: the server wins for any store it already
//    has, so a freshly-logged-in device can never clobber the shop's existing cloud data. Purely-local
//    stores the server lacks are uploaded. (Guest→shop migration is separate and explicit.)
//
// Only the signed-in shop workspace (`shop:*`) syncs; the guest workspace never does. Transport is
// pluggable for tests.
import { useEffect, useState } from 'react';
import {
  STORE_NAMES, STORAGE_WRITE_EVENT, WORKSPACE_EVENT, getActiveWorkspace, keyFor, read, write,
} from './storage';
import { currentSession, refresh as refreshSession, ACCOUNTS_ENABLED } from './account';

const API_BASE = (() => {
  try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); }
  catch { return ''; }
})();
const SYNC_BASE = `${API_BASE}/api/pwa-sync`;

export const SYNC_EVENT = 'vendora:sync';
const PUSH_DEBOUNCE_MS = 2000;
const POLL_MS = 60000;

// --- pluggable transport ---------------------------------------------------
async function fetchTransport(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${SYNC_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error((data && data.message) || `Sync failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data || {};
}
let _transport = fetchTransport;
/** Inject a transport (tests). Pass nothing to restore real fetch. */
export function __setSyncTransport(t) { _transport = t || fetchTransport; }

// --- state -----------------------------------------------------------------
const state = { status: 'idle', lastSyncedAt: 0, pending: 0, error: null };
function isOffline() { try { return typeof navigator !== 'undefined' && navigator.onLine === false; } catch { return false; } }
function setState(patch) {
  Object.assign(state, patch);
  try { window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { ...state } })); } catch { /* non-browser */ }
}
export function getSyncState() { return { ...state }; }

// --- sync meta (per workspace, local-only) ---------------------------------
function metaKey(ws) { return keyFor('__syncmeta', ws); }
function loadMeta(ws) {
  try { const r = localStorage.getItem(metaKey(ws)); return r ? JSON.parse(r) : {}; }
  catch { return {}; }
}
function saveMeta(ws, m) {
  try { localStorage.setItem(metaKey(ws), JSON.stringify(m)); } catch { /* ignore */ }
}
function countDirty(m) {
  let n = 0;
  for (const k of STORE_NAMES) if (m[k] && m[k].dirty) n += 1;
  return n;
}

// --- helpers ---------------------------------------------------------------
function activeShopWs() {
  const ws = getActiveWorkspace();
  return ws && ws.indexOf('shop:') === 0 ? ws : null;
}
/** Can a sync run right now? (session + shop workspace + online). Not gated on ACCOUNTS_ENABLED so it
 *  stays unit-testable; the wiring in startSync() is what respects the flag in production. */
function canSync() {
  const s = currentSession();
  return !!(s && s.token && activeShopWs() && !isOffline());
}

let applyingRemote = false;
function applyRemote(ws, name, value) {
  applyingRemote = true;
  try { write(name, value, ws); } finally { applyingRemote = false; }
}

// --- the core --------------------------------------------------------------
let syncing = false;
async function authedRequest(path, opts) {
  const s = currentSession();
  try {
    return await _transport(path, { ...opts, token: s && s.token });
  } catch (err) {
    if (err && err.status === 401 && s && s.refreshToken) {
      // Access token expired — refresh once and retry.
      const next = await refreshSession();
      return _transport(path, { ...opts, token: next && next.token });
    }
    throw err;
  }
}

/** Run a full pull+push reconcile for the signed-in shop. Safe to call often; coalesces. */
export async function syncNow() {
  if (syncing) return { ok: false, skipped: true };
  if (!canSync()) { setState({ status: isOffline() ? 'offline' : 'idle' }); return { ok: false, skipped: true }; }
  const ws = activeShopWs();
  syncing = true;
  setState({ status: 'syncing', error: null });
  try {
    const meta = loadMeta(ws);
    const bootstrapped = !!meta.__boot;
    let changedLocal = false;

    // 1) PULL — adopt anything the server has that we haven't seen.
    const pull = await authedRequest('/pull', { method: 'GET' });
    const serverNames = new Set();
    for (const b of pull.blobs || []) {
      if (!STORE_NAMES.includes(b.name)) continue;
      serverNames.add(b.name);
      const lm = meta[b.name] || { rev: 0, mtime: 0, dirty: false };
      if (!bootstrapped) {
        // First sync for this device: server wins for anything it already has (never clobber cloud data).
        applyRemote(ws, b.name, b.value);
        meta[b.name] = { rev: b.rev, mtime: b.mtime, dirty: false };
        changedLocal = true;
      } else if (b.rev > (lm.rev || 0)) {
        if (lm.dirty && (lm.mtime || 0) > (b.mtime || 0)) {
          // Our unpushed change is newer — keep it, but adopt the server rev so our push fast-forwards.
          meta[b.name] = { ...lm, rev: b.rev };
        } else {
          applyRemote(ws, b.name, b.value);
          meta[b.name] = { rev: b.rev, mtime: b.mtime, dirty: false };
          changedLocal = true;
        }
      }
    }

    // 2) PUSH — dirty stores, plus (on bootstrap) purely-local stores the server doesn't have yet.
    const changes = [];
    for (const name of STORE_NAMES) {
      const lm = meta[name];
      const localVal = read(name, null, ws);
      const hasLocal = localVal != null;
      if (!hasLocal) continue;
      const dirty = !!(lm && lm.dirty);
      const uploadNew = !bootstrapped ? !serverNames.has(name) : (!lm || (lm.rev || 0) === 0);
      if (dirty || uploadNew) {
        changes.push({ name, value: localVal, baseRev: (lm && lm.rev) || 0, mtime: (lm && lm.mtime) || Date.now() });
      }
    }
    if (changes.length) {
      const res = await authedRequest('/push', { method: 'POST', body: { changes } });
      for (const a of res.applied || []) {
        const lm = meta[a.name] || {};
        meta[a.name] = { rev: a.rev, mtime: lm.mtime || Date.now(), dirty: false };
      }
      for (const c of res.conflicts || []) {
        applyRemote(ws, c.name, c.value); // server's copy won — adopt it
        meta[c.name] = { rev: c.rev, mtime: c.mtime, dirty: false };
        changedLocal = true;
      }
    }

    meta.__boot = true;
    saveMeta(ws, meta);
    if (changedLocal) {
      // Tell live store hooks to re-read (they listen to the workspace event). `synced` marks it so our
      // own workspace listener doesn't treat it as a reason to sync again.
      try { window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT, { detail: { synced: true } })); } catch { /* ignore */ }
    }
    setState({ status: 'synced', lastSyncedAt: Date.now(), pending: countDirty(meta), error: null });
    return { ok: true, changedLocal };
  } catch (err) {
    setState({ status: isOffline() ? 'offline' : 'error', error: (err && err.message) || 'Sync failed' });
    return { ok: false, error: err };
  } finally {
    syncing = false;
  }
}

// --- scheduling ------------------------------------------------------------
let pushTimer = null;
function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; syncNow(); }, PUSH_DEBOUNCE_MS);
}

/** Mark a store locally changed (dirty) so the next sync pushes it. Exposed for tests. */
export function markStoreDirty(name, mtime = Date.now()) {
  const shopWs = activeShopWs();
  if (!shopWs || !STORE_NAMES.includes(name)) return;
  const m = loadMeta(shopWs);
  m[name] = { ...(m[name] || { rev: 0 }), mtime, dirty: true };
  saveMeta(shopWs, m);
  setState({ pending: countDirty(m) });
}

function onLocalWrite(e) {
  if (applyingRemote) return; // ignore writes we made while applying remote data
  const name = e && e.detail && e.detail.name;
  const ws = e && e.detail && e.detail.ws;
  if (ws !== activeShopWs() || !STORE_NAMES.includes(name)) return;
  markStoreDirty(name);
  schedulePush();
}

function onWorkspaceOrSession(e) {
  if (e && e.detail && e.detail.synced) return; // our own post-sync refresh
  // Small delay so login/workspace switch settles (session written, workspace active) before we sync.
  setTimeout(() => syncNow(), 300);
}
function onOnlineVisible() { if (canSync()) syncNow(); }

// --- lifecycle -------------------------------------------------------------
let started = false;
let pollId = null;
/** Wire background sync. Respects ACCOUNTS_ENABLED (no-op when accounts are off). Idempotent. */
export function startSync() {
  if (started || !ACCOUNTS_ENABLED) return;
  started = true;
  try {
    window.addEventListener(STORAGE_WRITE_EVENT, onLocalWrite);
    window.addEventListener(WORKSPACE_EVENT, onWorkspaceOrSession);
    window.addEventListener('vendora:session', onWorkspaceOrSession);
    window.addEventListener('online', onOnlineVisible);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onOnlineVisible(); });
    pollId = setInterval(() => { if (canSync()) syncNow(); }, POLL_MS);
  } catch { /* non-browser */ }
  if (canSync()) syncNow();
}
export function stopSync() {
  if (!started) return;
  started = false;
  try {
    window.removeEventListener(STORAGE_WRITE_EVENT, onLocalWrite);
    window.removeEventListener(WORKSPACE_EVENT, onWorkspaceOrSession);
    window.removeEventListener('vendora:session', onWorkspaceOrSession);
    window.removeEventListener('online', onOnlineVisible);
    if (pollId) clearInterval(pollId);
  } catch { /* ignore */ }
  pollId = null;
}

/** Test hook: reset internal flags/timers between tests. */
export function __resetSyncForTest() {
  started = false; syncing = false; applyingRemote = false;
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  if (pollId) { clearInterval(pollId); pollId = null; }
  Object.assign(state, { status: 'idle', lastSyncedAt: 0, pending: 0, error: null });
}

// --- React hook ------------------------------------------------------------
export function useSyncStatus() {
  const [s, setS] = useState(getSyncState);
  useEffect(() => {
    const on = (e) => setS(e && e.detail ? { ...e.detail } : getSyncState());
    window.addEventListener(SYNC_EVENT, on);
    return () => window.removeEventListener(SYNC_EVENT, on);
  }, []);
  return s;
}
