// Product pictures (core feature). Local-first: the owner's photo is compressed to a full image + a small
// thumbnail and kept ON-DEVICE (so it shows instantly and offline). Only a tiny REFERENCE lives on the
// product record (`product.image = { id, source, attribution? }`) — never the bytes — so pictures never bloat
// the JSON sync blobs. When the backend flag is on + signed in, the full image is also backed up to GridFS
// (shop-scoped) so it reaches other devices; thumbnails are cached per-device for offline use.
//
// Selection order for what to show after a scan:
//   1. the owner's saved photo   2. a previously confirmed catalogue image
//   3. a provider SUGGESTION (labelled + attributed, until the owner confirms it)   4. a placeholder.
//
// Honesty: a provider suggestion is never stored or shown as the shop's own until the owner confirms it, and
// an owner photo is never overwritten automatically.
import { read, write, removeKey, getActiveWorkspace } from './storage';
import { downscaleImage } from './image';
import { currentSession, isLoggedIn } from './account';

const FULL = (id) => `pimg_full_${id}`;
const THUMB = (id) => `pimg_thumb_${id}`;
const TRASH = (id) => `pimg_trash_${id}`; // recoverable-delete holding slot (JSON { full, thumb, at })
const BACKUP_MAP = 'pimg_backup_v1';       // per-device map { [id]: { state, at, error?, barcode?, source? } } — NOT synced

// Backup lifecycle a picture can be in (per device). 'local' = kept on this device only (flag off, offline, or
// not yet attempted); 'pending' = an upload is in flight; 'backed-up' = confirmed on the shop's server store;
// 'failed' = an upload errored and is retryable. The UI shows these so the owner knows a photo is safe
// off-device (or needs a retry) — a photo is never silently lost.
export const BACKUP_STATE = { LOCAL: 'local', PENDING: 'pending', DONE: 'backed-up', FAILED: 'failed' };

const API_BASE = (() => { try { return (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, ''); } catch { return ''; } })();
const BASE = `${API_BASE}/api/pwa-images`;

export function imagesFlagOn() { try { return import.meta.env.VITE_PRODUCT_IMAGES === 'true'; } catch { return false; } }

export function newImageId() {
  try { if (crypto?.randomUUID) return `pi_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `pi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- image processing (injectable for tests) -------------------------------
let _downscale = downscaleImage;
export function __setDownscale(fn) { _downscale = fn || downscaleImage; }

/** Compress a source (data URL / Blob) into a full image + a thumbnail. Canvas re-encode strips EXIF/GPS
 *  metadata. Returns { full, thumb } data URLs (full falls back to the source if the env can't process it). */
export async function processImage(src) {
  const full = (await _downscale(src, { maxDim: 1000, quality: 0.72, type: 'image/jpeg' })) || (typeof src === 'string' ? src : null);
  const thumb = (await _downscale(full || src, { maxDim: 200, quality: 0.6, type: 'image/jpeg' })) || full;
  return { full, thumb };
}

// --- backup-state map (per device; drives the local/pending/backed-up/failed UI) -------------------------
// Audit FE1: an async photo op must read/write the workspace it STARTED in, not whichever shop is active when
// the await resolves — otherwise a prior shop's photo/state can be written under another account. Every
// local helper therefore takes an explicit `ws` (captured at the operation's entry), defaulting to the
// current workspace only for synchronous/UI callers.
function readBackupMap(ws = getActiveWorkspace()) { try { return JSON.parse(read(BACKUP_MAP, 'null', ws)) || {}; } catch { return {}; } }
function writeBackupMap(m, ws = getActiveWorkspace()) { try { write(BACKUP_MAP, JSON.stringify(m || {}), ws); } catch { /* ignore */ } }

/** The backup record for an image id: { state, at, error?, barcode?, source? }. Defaults to LOCAL. */
export function getBackupState(id) {
  if (!id) return { state: BACKUP_STATE.LOCAL };
  const rec = readBackupMap()[id];
  return rec && rec.state ? rec : { state: BACKUP_STATE.LOCAL };
}
function setBackupState(id, patch, ws = getActiveWorkspace()) {
  if (!id) return;
  const m = readBackupMap(ws);
  m[id] = { ...(m[id] || {}), ...patch, at: Date.now() };
  writeBackupMap(m, ws);
}
function clearBackupState(id, ws = getActiveWorkspace()) { const m = readBackupMap(ws); if (m[id]) { delete m[id]; writeBackupMap(m, ws); } }

/** Ids that still need a (re)upload: anything FAILED, or PENDING left stale by a closed tab / lost network. */
export function pendingBackups() {
  const m = readBackupMap();
  return Object.entries(m)
    .filter(([, r]) => r && (r.state === BACKUP_STATE.FAILED || r.state === BACKUP_STATE.PENDING))
    .map(([id, r]) => ({ id, barcode: r.barcode || null, source: r.source || 'owner' }));
}
export function pendingBackupCount() { return pendingBackups().length; }

// --- local store -----------------------------------------------------------
export function getThumbLocal(id, ws = getActiveWorkspace()) { return id ? read(THUMB(id), null, ws) : null; }
export function getFullLocal(id, ws = getActiveWorkspace()) { return id ? read(FULL(id), null, ws) : null; }
export function hasLocal(id) { return !!getThumbLocal(id) || !!getFullLocal(id); }

function putLocal(id, { full, thumb }, ws = getActiveWorkspace()) {
  if (full) write(FULL(id), full, ws);
  if (thumb) write(THUMB(id), thumb, ws);
}

/**
 * Save a new owner/catalogue image locally from a source (data URL / Blob). Does NOT touch the product
 * record — the caller sets `product.image` via the inventory store (an explicit action). @returns {{id, thumb}}
 */
export async function saveImage(src, { source = 'owner', ws = getActiveWorkspace() } = {}) {
  const id = newImageId();
  const { full, thumb } = await processImage(src); // async — pin the workspace captured at entry (FE1)
  if (!full && !thumb) return { ok: false, error: 'Couldn’t process that image' };
  putLocal(id, { full, thumb }, ws);
  return { ok: true, id, thumb, full, source };
}

/** Recoverable delete: move the bytes to a trash slot and (caller) clear the product ref. */
export function removeImage(id) {
  if (!id) return { ok: false };
  const full = getFullLocal(id); const thumb = getThumbLocal(id);
  if (full || thumb) {
    try { write(TRASH(id), JSON.stringify({ full, thumb, at: Date.now() })); } catch { /* ignore */ }
  }
  removeKey(FULL(id)); removeKey(THUMB(id));
  clearBackupState(id); // the server copy is removed separately via deleteBackup() (authorised, async)
  return { ok: true, recoverable: !!(full || thumb) };
}

/** Undo a recoverable delete. @returns {{ok, thumb?}} */
export function restoreImage(id) {
  let t = null;
  try { t = JSON.parse(read(TRASH(id), 'null')); } catch { t = null; }
  if (!t) return { ok: false };
  putLocal(id, { full: t.full, thumb: t.thumb });
  removeKey(TRASH(id));
  return { ok: true, thumb: t.thumb };
}

/** Purge a trashed image for good (housekeeping). */
export function purgeTrashed(id) { removeKey(TRASH(id)); }

/**
 * Resolve what to display for a product, per the selection order. `suggested` is the (optional) provider
 * lookup result for this barcode ({ image, imageLarge, imageAttribution }). Pure — the component then loads
 * the actual thumb bytes for a stored image via getThumb().
 */
export function resolveImage(product, suggested = null) {
  const img = product && product.image;
  if (img && img.id && !img.deleted) {
    return { state: img.source === 'catalogue' ? 'catalogue' : 'owner', id: img.id, attribution: img.attribution || null, confirmed: true };
  }
  if (suggested && suggested.image) {
    return { state: 'suggested', url: suggested.image, urlLarge: suggested.imageLarge || suggested.image, attribution: suggested.imageAttribution || null, licence: suggested.imageLicence || null, confirmed: false };
  }
  return { state: 'placeholder' };
}

// --- cloud backup (flag-gated, shop-scoped; pluggable transport for tests) --
// Audit FE1: pin the bearer token captured at the operation's entry so an upload/download/delete can never run
// under a shop the user has since switched to. A null token falls back to the current session (sync callers).
function currentToken() { const s = currentSession(); return s && s.token ? s.token : null; }
function authHeaderFor(token) { const tk = token || currentToken(); return tk ? { Authorization: `Bearer ${tk}` } : {}; }
async function _status(token) {
  const res = await fetch(`${BASE}/status`, { headers: authHeaderFor(token) });
  let d = null; try { d = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error('status failed');
  return d || {};
}
async function _upload(id, blob, { barcode, source, token } = {}) {
  const form = new FormData();
  form.append('file', blob, id);
  if (barcode) form.append('barcode', barcode);
  if (source) form.append('source', source);
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'POST', headers: authHeaderFor(token), body: form });
  let d = null; try { d = await res.json(); } catch { /* ignore */ }
  if (!res.ok) { const e = new Error((d && d.message) || 'upload failed'); e.status = res.status; throw e; }
  return d || {};
}
async function _download(id, token) {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { headers: authHeaderFor(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('download failed');
  return res.blob();
}
async function _remove(id, token) {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: authHeaderFor(token) });
  if (!res.ok && res.status !== 404) { const e = new Error('delete failed'); e.status = res.status; throw e; }
  return true;
}
const _defaultTransport = () => ({ status: _status, upload: _upload, download: _download, remove: _remove });
let _t = _defaultTransport();
export function __setImageTransport(t) { _t = t || _defaultTransport(); }

const dataUrlToBlob = async (d) => (await fetch(d)).blob();
const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = rej; r.readAsDataURL(blob); });

// Tests can bypass the flag/login preconditions (null = normal behaviour).
let _availabilityOverride = null;
export function __setBackupAvailability(v) { _availabilityOverride = v == null ? null : !!v; }

/** Is cloud image backup usable now? (flag on + signed in + server enabled). false on any failure. Pass the
 *  token captured at entry so the check is for THAT identity (FE1). */
export async function backupAvailable(token) {
  if (_availabilityOverride === false) return false;
  if (_availabilityOverride !== true && (!imagesFlagOn() || !isLoggedIn())) return false;
  try { return !!(await _t.status(token)).enabled; } catch { return false; }
}

/**
 * Back up a stored image's FULL bytes to the shop's server store, tracking the lifecycle so the UI can show
 * local → pending → backed-up / failed. A failure leaves a FAILED record that `retryBackups()` can re-send.
 * Best-effort (never throws); returns { ok, state }.
 */
export async function backupImage(id, { barcode = null, source = 'owner', ws = getActiveWorkspace(), token = currentToken() } = {}) {
  const full = getFullLocal(id, ws);
  if (!full) return { ok: false, state: BACKUP_STATE.LOCAL, error: 'nothing to back up' };
  if (!(await backupAvailable(token))) {
    // Keep it queued as FAILED so it uploads once backup becomes available (sign-in / flag on / back online).
    setBackupState(id, { state: BACKUP_STATE.FAILED, error: 'backup unavailable', barcode, source }, ws);
    return { ok: false, state: BACKUP_STATE.FAILED, error: 'backup unavailable' };
  }
  setBackupState(id, { state: BACKUP_STATE.PENDING, barcode, source, error: null }, ws);
  try {
    await _t.upload(id, await dataUrlToBlob(full), { barcode, source, token }); // pinned token (FE1)
    setBackupState(id, { state: BACKUP_STATE.DONE, error: null, barcode, source }, ws);
    return { ok: true, state: BACKUP_STATE.DONE };
  } catch (err) {
    setBackupState(id, { state: BACKUP_STATE.FAILED, error: err.message || 'upload failed', barcode, source }, ws);
    return { ok: false, state: BACKUP_STATE.FAILED, error: err.message || 'upload failed' };
  }
}

/** Retry every image still pending/failed. Safe to call repeatedly (idempotent on the server). */
export async function retryBackups() {
  if (!(await backupAvailable())) return { attempted: 0, ok: 0, failed: 0 };
  const items = pendingBackups();
  let ok = 0; let failed = 0;
  for (const it of items) {
    if (!getFullLocal(it.id)) { clearBackupState(it.id); continue; } // bytes gone (deleted) — drop the record
    const r = await backupImage(it.id, { barcode: it.barcode, source: it.source });
    if (r.ok) ok += 1; else failed += 1;
  }
  return { attempted: items.length, ok, failed };
}
/** Opportunistic flush (call on sign-in / regaining network / app focus). No-op when backup isn't available. */
export async function flushBackups() { return retryBackups(); }

// Register one-time listeners so pending/failed photo backups flush when the app regains network or focus
// (mirrors how sync.js flushes). Idempotent — safe to call from App once.
let _autoRetryWired = false;
export function registerBackupAutoRetry() {
  if (_autoRetryWired || typeof window === 'undefined') return;
  _autoRetryWired = true;
  const run = () => { if (navigator.onLine !== false) flushBackups().catch(() => {}); };
  try {
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
  } catch { /* non-browser env */ }
}

/** Delete the server-side backup copy of an image (authorised by the signed-in shop token). Best-effort. */
export async function deleteBackup(id, { ws = getActiveWorkspace(), token = currentToken() } = {}) {
  clearBackupState(id, ws);
  if (!id || !(await backupAvailable(token))) return { ok: false };
  try { await _t.remove(id, token); return { ok: true }; }
  catch { return { ok: false }; }
}

const LOOKUP_IMG = `${API_BASE}/api/pwa-lookup/image`;

/** Fetch a provider SUGGESTED image (via our CSP-safe proxy) as a data URL. null on any failure/offline. */
export async function fetchSuggestedImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(`${LOOKUP_IMG}?url=${encodeURIComponent(url)}`, { headers: authHeaderFor() });
    if (!res.ok) return null;
    return await blobToDataUrl(await res.blob());
  } catch { return null; }
}

/**
 * Confirm a provider suggestion as the product's picture: fetch it (proxy), compress + store locally as a
 * 'catalogue' image with its attribution, and (if available) back it up. Returns an image ref for the product
 * record, or null on failure. Never overwrites silently — the caller only calls this on an explicit confirm.
 */
export async function confirmSuggested(suggested, { barcode = null } = {}) {
  if (!suggested || !suggested.image) return null;
  const ws = getActiveWorkspace(); const token = currentToken(); // pin identity at entry (FE1)
  const dataUrl = await fetchSuggestedImage(suggested.imageLarge || suggested.image);
  if (!dataUrl) return null;
  const saved = await saveImage(dataUrl, { source: 'catalogue', ws });
  if (!saved.ok) return null;
  // Track the backup lifecycle (queues as FAILED for retry if backup isn't available yet).
  backupImage(saved.id, { barcode, source: 'catalogue', ws, token });
  return { id: saved.id, source: 'catalogue', attribution: suggested.imageAttribution || null, updatedAt: Date.now() };
}

/** Fetch an image from the shop's server store into the local cache (for a device that doesn't hold it). */
export async function fetchImageToCache(id) {
  const ws = getActiveWorkspace(); const token = currentToken(); // pin identity at entry (FE1)
  try {
    const blob = await _t.download(id, token);
    if (!blob) return { ok: false };
    const full = await blobToDataUrl(blob);
    const { thumb } = await processImage(full);
    putLocal(id, { full, thumb }, ws);
    setBackupState(id, { state: BACKUP_STATE.DONE }, ws); // it came FROM the server, so it's backed up here now
    return { ok: true, thumb };
  } catch { return { ok: false }; }
}
