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
// Apply a remote value to a store WITHOUT marking it dirty. Returns write()'s result so the caller can
// avoid acknowledging a blob as synced when the local write actually failed (audit: false "synced" state).
function applyRemote(ws, name, value) {
  applyingRemote = true;
  try { return write(name, value, ws); } finally { applyingRemote = false; }
}

/** True while the signed-in account + active workspace still match the identity a reconcile started with. */
function sessionOk(shopId, ws) {
  const s = currentSession();
  return !!(s && s.token && s.shop && s.shop.id === shopId && activeShopWs() === ws);
}

// --- the core --------------------------------------------------------------
let syncing = false;

// Every request in one reconcile uses the SAME captured token + identity (ctx). On 401 we refresh once,
// but only accept the refreshed token if the session is STILL the same account/workspace — otherwise a
// slow request during an account switch could send one shop's data under another's token (audit P1).
async function authedRequest(path, opts, ctx) {
  try {
    return await _transport(path, { ...opts, token: ctx.token });
  } catch (err) {
    if (err && err.status === 401) {
      const next = await refreshSession().catch(() => null);
      if (next && next.token && sessionOk(ctx.shopId, ctx.ws)) {
        ctx.token = next.token;
        return _transport(path, { ...opts, token: ctx.token });
      }
    }
    throw err;
  }
}

/** Run a full pull+push reconcile for the signed-in shop. Safe to call often; coalesces. */
export async function syncNow() {
  if (syncing) return { ok: false, skipped: true };
  if (!canSync()) { setState({ status: isOffline() ? 'offline' : 'idle' }); return { ok: false, skipped: true }; }
  const session0 = currentSession();
  const ws = activeShopWs();
  const ctx = { token: session0.token, shopId: session0.shop && session0.shop.id, ws };
  // If the account/workspace changes mid-flight, bail before persisting anything (audit P1).
  const guard = () => { if (!sessionOk(ctx.shopId, ctx.ws)) throw new Error('__aborted__'); };

  syncing = true;
  setState({ status: 'syncing', error: null });
  try {
    const meta = loadMeta(ws);
    const bootstrapped = !!meta.__boot;

    // Results from the network phase; merged into FRESHLY-reloaded meta at the end so edits made WHILE a
    // request was in flight aren't clobbered (audit P1: in-flight edits marked clean without upload).
    const adoptions = [];      // { name, rev, mtime, keepDirty? } (value already written to storage)
    const applied = [];        // { name, rev, sentMtime }
    const conflicts = [];      // { name, rev, mtime } (value already written to storage)
    const adopted = new Set(); // stores we took from the server this run — never push them back
    let writeFailed = false;

    // 1) PULL — adopt anything the server has that we haven't seen.
    const pull = await authedRequest('/pull', { method: 'GET' }, ctx);
    guard();
    const serverNames = new Set();
    for (const b of pull.blobs || []) {
      if (!STORE_NAMES.includes(b.name)) continue;
      serverNames.add(b.name);
      const lm = meta[b.name] || { rev: 0, mtime: 0, dirty: false };
      let take;
      if (!bootstrapped) take = true;                       // first sync: server wins (never clobber cloud)
      else if (b.rev > (lm.rev || 0)) take = !(lm.dirty && (lm.mtime || 0) > (b.mtime || 0));
      else take = false;
      if (take) {
        const res = applyRemote(ws, b.name, b.value);
        if (res && res.ok) { adoptions.push({ name: b.name, rev: b.rev, mtime: b.mtime }); adopted.add(b.name); }
        else writeFailed = true;
      } else if (b.rev > (lm.rev || 0)) {
        // local unpushed edit is newer — keep it; adopt the server rev so our push fast-forwards.
        adoptions.push({ name: b.name, rev: b.rev, mtime: lm.mtime, keepDirty: true });
      }
    }

    // 2) PUSH — dirty stores, cleared stores, and (on bootstrap) purely-local stores the server lacks.
    const sentMtime = {};
    const changes = [];
    for (const name of STORE_NAMES) {
      if (adopted.has(name)) continue; // we just took the server's copy — don't push it back
      const lm = meta[name];
      const localVal = read(name, null, ws);
      const dirty = !!(lm && lm.dirty);
      if (localVal != null) {
        const uploadNew = !bootstrapped ? !serverNames.has(name) : (!lm || (lm.rev || 0) === 0);
        if (dirty || uploadNew) {
          sentMtime[name] = (lm && lm.mtime) || Date.now();
          changes.push({ name, value: localVal, baseRev: (lm && lm.rev) || 0, mtime: sentMtime[name] });
        }
      } else if (dirty && lm && (lm.rev || 0) > 0) {
        // Store was cleared locally after being synced — propagate the clear as an empty value so other
        // devices don't resurrect it (audit P2: deleted stores never propagated).
        sentMtime[name] = lm.mtime || Date.now();
        changes.push({ name, value: '', baseRev: lm.rev, mtime: sentMtime[name] });
      }
    }
    if (changes.length) {
      const res = await authedRequest('/push', { method: 'POST', body: { changes } }, ctx);
      guard();
      for (const a of res.applied || []) applied.push({ name: a.name, rev: a.rev, sentMtime: sentMtime[a.name] });
      for (const c of res.conflicts || []) {
        const r = applyRemote(ws, c.name, c.value); // server's copy won — adopt it
        if (r && r.ok) conflicts.push({ name: c.name, rev: c.rev, mtime: c.mtime });
        else writeFailed = true;
      }
    }

    // 3) MERGE into a FRESH copy of meta so anything the user changed during the requests survives.
    guard();
    const fresh = loadMeta(ws);
    for (const a of adoptions) {
      const cur = fresh[a.name] || {};
      if (a.keepDirty) fresh[a.name] = { ...cur, rev: a.rev };
      else if (cur.dirty && (cur.mtime || 0) > (a.mtime || 0)) fresh[a.name] = { ...cur, rev: a.rev }; // newer edit after adopt
      else fresh[a.name] = { rev: a.rev, mtime: a.mtime, dirty: false };
    }
    for (const a of applied) {
      const cur = fresh[a.name] || {};
      // Only clear dirty if no newer edit landed since we sent this value.
      if (cur.dirty && (cur.mtime || 0) > (a.sentMtime || 0)) fresh[a.name] = { ...cur, rev: a.rev };
      else fresh[a.name] = { rev: a.rev, mtime: cur.mtime || a.sentMtime || Date.now(), dirty: false };
    }
    for (const c of conflicts) fresh[c.name] = { rev: c.rev, mtime: c.mtime, dirty: false };
    fresh.__boot = true;
    saveMeta(ws, fresh);

    const changedLocal = adoptions.length > 0 || conflicts.length > 0;
    if (changedLocal) {
      try { window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT, { detail: { synced: true } })); } catch { /* ignore */ }
    }
    if (writeFailed) {
      setState({ status: 'error', error: 'Some changes couldn’t be saved on this device', pending: countDirty(fresh) });
      return { ok: false, writeFailed: true };
    }
    setState({ status: 'synced', lastSyncedAt: Date.now(), pending: countDirty(fresh), error: null });
    return { ok: true, changedLocal };
  } catch (err) {
    if (err && err.message === '__aborted__') { setState({ status: 'idle' }); return { ok: false, aborted: true }; }
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
