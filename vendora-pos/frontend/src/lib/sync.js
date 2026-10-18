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
import { stashConflict, conflictCount } from './conflictBackup';
import { MERGE_STORES, mergeStoreArrays, mergeMovements, mergeTombstones, tombstoneMap, applyTombstones } from './mergeStore';
import { TOMBSTONES_STORE } from './tombstoneStore';
import { noteServerDate } from './syncClock';

export const CONFLICT_EVENT = 'vendora:conflict';

const API_BASE = (() => {
  try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); }
  catch { return ''; }
})();
const SYNC_BASE = `${API_BASE}/api/pwa-sync`;

export const SYNC_EVENT = 'vendora:sync';
// Batch a burst of edits into ONE push (≥5s), coalescing every dirty store — so rapid +/- taps or a quick
// multi-field edit become a single request instead of a push per keystroke (scale: ~500 devices).
const PUSH_DEBOUNCE_MS = 5000;
// Poll cadence (scale): slow in the background, fast only while the user is actively editing, and NOTHING
// while the tab is hidden (a backgrounded phone in someone's pocket shouldn't poll every minute). The
// delta-pull + ETag means an idle poll that finds nothing is a tiny 304, but fewer of them still helps 500×.
const IDLE_POLL_MS = 5 * 60 * 1000;      // background drift-catch when nobody's editing
const ACTIVE_POLL_MS = 60 * 1000;        // while the user is actively editing (or just after opening)
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;  // "actively editing" = an edit within this window
const STARTUP_FAST_MS = 10 * 60 * 1000;  // poll at the fast cadence for the first 10 min after opening (#5)

// --- pluggable transport ---------------------------------------------------
async function fetchTransport(path, { method = 'GET', body, token, query, ifNoneMatch } = {}) {
  let url = `${SYNC_BASE}${path}`;
  if (query && typeof query === 'object') {
    const qs = Object.entries(query)
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  // Learn the server's wall-clock to correct a skewed device clock for merge/tombstone timestamps (#3).
  try { noteServerDate(res.headers.get('Date')); } catch { /* headers unavailable (tests) */ }
  // 304 Not Modified (delta pull, nothing changed) — no body; tell the caller to skip the adopt phase.
  if (res.status === 304) {
    let etag = ifNoneMatch;
    try { etag = res.headers.get('ETag') || ifNoneMatch; } catch { /* no headers in some environments */ }
    return { __notModified: true, __etag: etag };
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error((data && data.message) || `Sync failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const out = data || {};
  try { const et = res.headers.get('ETag'); if (et) out.__etag = et; } catch { /* no headers (tests) */ }
  return out;
}
let _transport = fetchTransport;
/** Inject a transport (tests). Pass nothing to restore real fetch. */
export function __setSyncTransport(t) { _transport = t || fetchTransport; }

// --- state -----------------------------------------------------------------
const state = { status: 'idle', lastSyncedAt: 0, pending: 0, error: null, conflicts: 0 };
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
    const rejected = [];       // names the server refused for this role (financial stores for staff)
    const adopted = new Set(); // stores we took from the server this run — never push them back
    let writeFailed = false;
    let stashed = 0;           // local edits preserved to recovery because another device's copy won

    // 1) PULL — adopt anything the server has that we haven't seen. DELTA pull: send the revs we already
    // hold so the server returns only newer stores (and a 304 when nothing changed), plus our last ETag as
    // If-None-Match. On first sync (no meta) we send neither, so the server returns everything (safe bootstrap).
    const revsParam = STORE_NAMES
      .filter((n) => meta[n] && (meta[n].rev || 0) > 0)
      .map((n) => `${n}:${meta[n].rev}`)
      .join(',');
    const pull = await authedRequest(
      '/pull',
      { method: 'GET', query: revsParam ? { revs: revsParam } : undefined, ifNoneMatch: meta.__etag || undefined },
      ctx,
    );
    guard();
    const pulledEtag = pull && pull.__etag;       // remember for the next poll's If-None-Match (saved into fresh meta)

    // ── Per-item merge context (item #3) ──────────────────────────────────────────────────────────────
    // For the id-keyed MERGE_STORES we union local + server by item id instead of whole-store last-write-wins,
    // so two staff editing the same shop don't clobber each other. Stock quantity is rebuilt from the UNION of
    // both devices' movement ledgers (conflict-free), and deletes are honoured via the shared tombstone store.
    const serverBlob = {};
    for (const b of (pull.blobs || [])) serverBlob[b.name] = b;
    const parseArr = (v) => { try { const x = JSON.parse(v); return Array.isArray(x) ? x : []; } catch { return []; } };
    const localMovements = parseArr(read('movements_v1', null, ws));
    const serverMovements = serverBlob.movements_v1 ? parseArr(serverBlob.movements_v1.value) : [];
    const movementsAvailable = !!serverBlob.movements_v1; // only reconstruct qty when we have the server ledger
    const mergedMovements = mergeMovements(localMovements, serverMovements);
    const localTombs = parseArr(read(TOMBSTONES_STORE, null, ws));
    const serverTombs = serverBlob[TOMBSTONES_STORE] ? parseArr(serverBlob[TOMBSTONES_STORE].value) : [];
    const mergedTombs = mergeTombstones(localTombs, serverTombs);
    const isMergeStore = (name) => MERGE_STORES.has(name) || name === TOMBSTONES_STORE;
    const mergedValueFor = (name, serverValue) => {
      if (name === TOMBSTONES_STORE) return JSON.stringify(mergedTombs);
      const arr = mergeStoreArrays(name, parseArr(read(name, null, ws)), parseArr(serverValue), {
        localMovements, serverMovements, mergedMovements, movementsAvailable,
      });
      return JSON.stringify(applyTombstones(arr, tombstoneMap(mergedTombs, name)));
    };
    const mergeMeta = {}; // overrides written to fresh meta in step 3 (we fully manage merge stores' meta)
    let mergeDirty = false;

    const serverNames = new Set();
    for (const b of pull.blobs || []) {           // undefined on a 304 → adopt loop is simply skipped
      if (!STORE_NAMES.includes(b.name)) continue;
      serverNames.add(b.name);
      const lm = meta[b.name] || { rev: 0, mtime: 0, dirty: false };

      // MERGE path (ongoing syncs only): union local + server rather than pick a winner. On first sync we fall
      // through to the bootstrap rule below (server wins wholesale) so a fresh device never injects stale data.
      if (bootstrapped && isMergeStore(b.name)) {
        const mergedVal = mergedValueFor(b.name, b.value);
        const res = applyRemote(ws, b.name, mergedVal);
        if (res && res.ok) {
          adopted.add(b.name); // we manage this store's push/meta explicitly, not via the generic loop
          const serverVal = b.value == null ? '' : b.value;
          const changed = mergedVal !== serverVal; // merge produced info the server lacks → push it next cycle
          mergeMeta[b.name] = { rev: b.rev, mtime: changed ? Date.now() : (b.mtime || 0), dirty: changed };
          if (changed) mergeDirty = true;
        } else writeFailed = true;
        continue;
      }

      let take;
      if (!bootstrapped) take = true;                       // first sync: server wins (never clobber cloud)
      else if (b.rev > (lm.rev || 0)) take = !(lm.dirty && (lm.mtime || 0) > (b.mtime || 0));
      else take = false;
      if (take) {
        // If we're discarding a DIRTY local edit (our unsynced change lost LWW to the server's newer
        // copy), keep a recovery copy first so the owner's work is never silently lost (Phase 1.1g).
        if (lm.dirty) {
          const mine = read(b.name, null, ws);
          if (mine != null && mine !== b.value) { stashConflict(ws, { name: b.name, value: mine }); stashed += 1; }
        }
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
        // Our pushed value lost LWW — stash it before adopting the server's winner (Phase 1.1g).
        const sent = changes.find((ch) => ch.name === c.name);
        if (sent && sent.value != null && sent.value !== c.value) { stashConflict(ws, { name: c.name, value: sent.value }); stashed += 1; }
        const r = applyRemote(ws, c.name, c.value); // server's copy won — adopt it
        if (r && r.ok) conflicts.push({ name: c.name, rev: c.rev, mtime: c.mtime });
        else writeFailed = true;
      }
      // Stores this role isn't allowed to write (backend-enforced). Stop pushing them so sync doesn't
      // retry forever; the UI never lets this role edit them in the first place.
      for (const rj of res.rejected || []) rejected.push(rj.name);
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
    // Clear dirty on role-rejected stores so we don't keep re-sending a write the server will always refuse.
    for (const name of rejected) { const cur = fresh[name] || {}; fresh[name] = { ...cur, dirty: false }; }
    // Merge stores manage their own meta: adopt the server rev, and stay dirty when the union added info the
    // server lacks so the next push carries it back (a fast-forward from the rev we just adopted).
    for (const [name, m] of Object.entries(mergeMeta)) fresh[name] = m;
    fresh.__boot = true;
    // Remember the server's ETag so the next poll can send If-None-Match and get a cheap 304 when idle.
    if (pulledEtag) fresh.__etag = pulledEtag;
    saveMeta(ws, fresh);

    const changedLocal = adoptions.length > 0 || conflicts.length > 0 || Object.keys(mergeMeta).length > 0;
    if (changedLocal) {
      try { window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT, { detail: { synced: true } })); } catch { /* ignore */ }
    }
    // A merge produced a union the server doesn't have yet — push it promptly (debounced) so the other device
    // sees it without waiting for the next poll.
    if (mergeDirty) schedulePush();
    const conflictsN = conflictCount(ws);
    if (stashed > 0) {
      // Tell the UI a newer change from another device replaced one of theirs — and that we kept a copy.
      try { window.dispatchEvent(new CustomEvent(CONFLICT_EVENT, { detail: { count: conflictsN, added: stashed } })); } catch { /* ignore */ }
    }
    if (writeFailed) {
      setState({ status: 'error', error: 'Some changes couldn’t be saved on this device', pending: countDirty(fresh), conflicts: conflictsN });
      return { ok: false, writeFailed: true };
    }
    setState({ status: 'synced', lastSyncedAt: Date.now(), pending: countDirty(fresh), error: null, conflicts: conflictsN });
    return { ok: true, changedLocal, stashed };
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

// --- adaptive polling ------------------------------------------------------
// A self-rescheduling timer rather than a fixed interval: fast cadence right after an edit, slow when idle,
// and fully paused while the tab is hidden (resumes on return). This is the main request-volume lever at
// ~500 devices — a backgrounded phone makes zero sync calls, and idle shops poll 5× less than before.
let lastEditAt = 0;
let startedAt = 0;
let pollTimer = null;
function isHidden() { try { return typeof document !== 'undefined' && document.visibilityState === 'hidden'; } catch { return false; } }
function nextPollDelay() {
  const t = Date.now();
  // Fast cadence while actively editing OR during the first 10 minutes after opening (the window when a
  // shopkeeper is most likely to want another device's changes quickly); 5-min idle cadence after that.
  const fast = (t - lastEditAt < ACTIVE_WINDOW_MS) || (startedAt && t - startedAt < STARTUP_FAST_MS);
  return fast ? ACTIVE_POLL_MS : IDLE_POLL_MS;
}
function scheduleNextPoll() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  if (!started || isHidden()) return; // no polling while hidden; onVisibility() resumes it
  pollTimer = setTimeout(async () => {
    pollTimer = null;
    if (!isHidden() && canSync()) { try { await syncNow(); } catch { /* transient; next tick retries */ } }
    scheduleNextPoll();
  }, nextPollDelay());
}

function onLocalWrite(e) {
  if (applyingRemote) return; // ignore writes we made while applying remote data
  const name = e && e.detail && e.detail.name;
  const ws = e && e.detail && e.detail.ws;
  if (ws !== activeShopWs() || !STORE_NAMES.includes(name)) return;
  lastEditAt = Date.now();  // enter the fast-poll window
  markStoreDirty(name);
  schedulePush();
  scheduleNextPoll();       // shorten a pending idle poll to the active cadence
}

function onWorkspaceOrSession(e) {
  if (e && e.detail && e.detail.synced) return; // our own post-sync refresh
  // Small delay so login/workspace switch settles (session written, workspace active) before we sync.
  setTimeout(() => syncNow(), 300);
}
function onOnlineVisible() { if (canSync()) syncNow(); }
function onVisibility() {
  if (isHidden()) { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } return; } // pause while hidden
  if (canSync()) syncNow();  // catch up immediately on return to the tab
  scheduleNextPoll();        // and resume polling
}

// --- lifecycle -------------------------------------------------------------
let started = false;
/** Wire background sync. Respects ACCOUNTS_ENABLED (no-op when accounts are off). Idempotent. */
export function startSync() {
  if (started || !ACCOUNTS_ENABLED) return;
  started = true;
  startedAt = Date.now(); // begin the 10-min fast-poll window (#5)
  try {
    window.addEventListener(STORAGE_WRITE_EVENT, onLocalWrite);
    window.addEventListener(WORKSPACE_EVENT, onWorkspaceOrSession);
    window.addEventListener('vendora:session', onWorkspaceOrSession);
    window.addEventListener('online', onOnlineVisible);
    document.addEventListener('visibilitychange', onVisibility);
    scheduleNextPoll();
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
    document.removeEventListener('visibilitychange', onVisibility);
    if (pollTimer) clearTimeout(pollTimer);
  } catch { /* ignore */ }
  pollTimer = null;
}

/** Test hook: reset internal flags/timers between tests. */
export function __resetSyncForTest() {
  started = false; syncing = false; applyingRemote = false; lastEditAt = 0; startedAt = 0;
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  Object.assign(state, { status: 'idle', lastSyncedAt: 0, pending: 0, error: null, conflicts: 0 });
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
