// Invoice document backup client (Phase 3). The raw invoice photo/PDF is kept ON-DEVICE by invoiceStore
// (local-only, never in the sync blobs). THIS module optionally backs that file up to the server so it can
// be recovered on another device — over a dedicated file endpoint (/api/pwa-docs), NOT the JSON sync.
//
// HONESTY: a file is only shown as "Backed up" once the server has confirmed the upload. We never claim a
// document is recoverable on another device beyond what the server reports it holds. The backup is OFF
// unless the server has DOC_BACKUP=true AND the shop is signed in (it needs an account to scope files to).
//
// Per-device upload state (pending/uploaded/failed) is kept in a local-only store so the UI can show
// progress and offer a retry after an interrupted upload. It is advisory; the server list is authoritative.
import { currentSession, isLoggedIn } from './account';
import { readJSON, writeJSON, getActiveWorkspace } from './storage';

const API_BASE = (() => {
  try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); }
  catch { return ''; }
})();
const BASE = `${API_BASE}/api/pwa-docs`;
const STATE_KEY = 'doc_backup_state_v1'; // local-only (not in STORE_NAMES → never synced)

/** Build-time flag: the UI only offers backup when this is on AND the server reports it enabled. */
export function backupFlagOn() {
  try { return import.meta.env.VITE_DOC_BACKUP === 'true'; }
  catch { return false; }
}

// --- device-local status map { [fileId]: { status:'pending'|'uploaded'|'failed', at, size, error } } ----
export function getBackupState() { return readJSON(STATE_KEY, {}, getActiveWorkspace()) || {}; }
function setBackupState(fileId, patch) {
  const map = getBackupState();
  if (patch == null) delete map[fileId]; else map[fileId] = { ...(map[fileId] || {}), ...patch, at: Date.now() };
  writeJSON(STATE_KEY, map, getActiveWorkspace());
  try { window.dispatchEvent(new CustomEvent('vendora:doc-backup')); } catch { /* non-browser */ }
  return map;
}
export function backupStatusOf(fileId) { return (getBackupState()[fileId] || {}).status || 'none'; }

// --- transport (pluggable for tests) --------------------------------------
function authHeader() {
  const s = currentSession();
  return s && s.token ? { Authorization: `Bearer ${s.token}` } : {};
}
async function jsonReq(path, { method = 'GET' } = {}) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { ...authHeader() } });
  let data = null; try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) { const e = new Error((data && data.message) || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data || {};
}
async function uploadReq(fileId, blob, invoiceId) {
  const form = new FormData();
  form.append('file', blob, fileId);
  if (invoiceId) form.append('invoiceId', invoiceId);
  const res = await fetch(`${BASE}/invoice/${encodeURIComponent(fileId)}`, { method: 'POST', headers: { ...authHeader() }, body: form });
  let data = null; try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) { const e = new Error((data && data.message) || `Upload failed (${res.status})`); e.status = res.status; throw e; }
  return data || {};
}
async function downloadReq(fileId) {
  const res = await fetch(`${BASE}/invoice/${encodeURIComponent(fileId)}`, { headers: { ...authHeader() } });
  if (res.status === 404) return null;
  if (!res.ok) { const e = new Error(`Download failed (${res.status})`); e.status = res.status; throw e; }
  const blob = await res.blob();
  const type = res.headers.get('Content-Type') || blob.type || 'application/octet-stream';
  return { blob, type };
}
let _t = { jsonReq, uploadReq, downloadReq };
/** Inject a transport (tests). Pass nothing to restore real fetch. */
export function __setDocTransport(t) { _t = t || { jsonReq, uploadReq, downloadReq }; }

const dataUrlToBlob = async (dataUrl) => (await fetch(dataUrl)).blob();

// --- public API ------------------------------------------------------------
/** Is backup usable right now? (flag on + signed in + server enabled). Resolves false on any failure. */
export async function backupAvailable() {
  if (!backupFlagOn() || !isLoggedIn()) return false;
  try { const s = await _t.jsonReq('/status'); return !!s.enabled; }
  catch { return false; }
}

/** Server status: { enabled, provider, maxBytes }. */
export async function serverStatus() { return _t.jsonReq('/status'); }

/**
 * Back up one invoice file. Marks pending → uploaded/failed in the local state (for progress + retry).
 * @returns {{ ok, size? , error? }}
 */
export async function backupInvoiceFile({ fileId, dataUrl, type, invoiceId = null }) {
  if (!fileId || !dataUrl) return { ok: false, error: 'Nothing to back up' };
  setBackupState(fileId, { status: 'pending', error: null });
  try {
    const blob = await dataUrlToBlob(dataUrl);
    const typed = type && blob.type !== type ? blob.slice(0, blob.size, type) : blob; // keep the real mime
    const out = await _t.uploadReq(fileId, typed, invoiceId);
    setBackupState(fileId, { status: 'uploaded', size: out.size, error: null });
    return { ok: true, size: out.size };
  } catch (err) {
    setBackupState(fileId, { status: 'failed', error: err.message || 'Upload failed' });
    return { ok: false, error: err.message || 'Upload failed' };
  }
}

/** Retry any files currently in a failed state. `resolve(fileId)` returns { dataUrl, type } or null. */
export async function retryFailed(resolve) {
  const map = getBackupState();
  const results = [];
  for (const [fileId, s] of Object.entries(map)) {
    if (s.status !== 'failed') continue;
    const f = resolve ? resolve(fileId) : null;
    if (!f || !f.dataUrl) continue;
    results.push(await backupInvoiceFile({ fileId, dataUrl: f.dataUrl, type: f.type }));
  }
  return results;
}

/** Fetch a backed-up file as a data URL (for display on a device that doesn't hold it locally). null if none. */
export async function fetchBackedUpFile(fileId) {
  const r = await _t.downloadReq(fileId);
  if (!r) return null;
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result || ''));
    fr.onerror = rej;
    fr.readAsDataURL(r.blob);
  });
  return { dataUrl, type: r.type };
}

/** Delete a file's server backup (retention control). Clears local state too. */
export async function deleteBackup(fileId) {
  const out = await _t.jsonReq(`/invoice/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
  setBackupState(fileId, null);
  return out;
}

/** The set of fileIds the server has backed up for this shop (authoritative). */
export async function listBackedUp() {
  const out = await _t.jsonReq('/invoice');
  return new Set((out.files || []).map((f) => f.fileId));
}

export function __clearBackupStateForTest() { try { writeJSON(STATE_KEY, {}, getActiveWorkspace()); } catch { /* ignore */ } }
