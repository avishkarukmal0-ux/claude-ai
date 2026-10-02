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

// --- local store -----------------------------------------------------------
export function getThumbLocal(id) { return id ? read(THUMB(id), null) : null; }
export function getFullLocal(id) { return id ? read(FULL(id), null) : null; }
export function hasLocal(id) { return !!getThumbLocal(id) || !!getFullLocal(id); }

function putLocal(id, { full, thumb }) {
  if (full) write(FULL(id), full);
  if (thumb) write(THUMB(id), thumb);
}

/**
 * Save a new owner/catalogue image locally from a source (data URL / Blob). Does NOT touch the product
 * record — the caller sets `product.image` via the inventory store (an explicit action). @returns {{id, thumb}}
 */
export async function saveImage(src, { source = 'owner' } = {}) {
  const id = newImageId();
  const { full, thumb } = await processImage(src);
  if (!full && !thumb) return { ok: false, error: 'Couldn’t process that image' };
  putLocal(id, { full, thumb });
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
function authHeader() { const s = currentSession(); return s && s.token ? { Authorization: `Bearer ${s.token}` } : {}; }
async function _status() {
  const res = await fetch(`${BASE}/status`, { headers: authHeader() });
  let d = null; try { d = await res.json(); } catch { /* ignore */ }
  if (!res.ok) throw new Error('status failed');
  return d || {};
}
async function _upload(id, blob, { barcode, source } = {}) {
  const form = new FormData();
  form.append('file', blob, id);
  if (barcode) form.append('barcode', barcode);
  if (source) form.append('source', source);
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { method: 'POST', headers: authHeader(), body: form });
  let d = null; try { d = await res.json(); } catch { /* ignore */ }
  if (!res.ok) { const e = new Error((d && d.message) || 'upload failed'); e.status = res.status; throw e; }
  return d || {};
}
async function _download(id) {
  const res = await fetch(`${BASE}/${encodeURIComponent(id)}`, { headers: authHeader() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('download failed');
  return res.blob();
}
let _t = { status: _status, upload: _upload, download: _download };
export function __setImageTransport(t) { _t = t || { status: _status, upload: _upload, download: _download }; }

const dataUrlToBlob = async (d) => (await fetch(d)).blob();
const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result || '')); r.onerror = rej; r.readAsDataURL(blob); });

/** Is cloud image backup usable now? (flag on + signed in + server enabled). false on any failure. */
export async function backupAvailable() {
  if (!imagesFlagOn() || !isLoggedIn()) return false;
  try { return !!(await _t.status()).enabled; } catch { return false; }
}

/** Back up a stored image's FULL bytes to the shop's server store. Best-effort; returns {ok}. */
export async function backupImage(id, { barcode = null, source = 'owner' } = {}) {
  const full = getFullLocal(id);
  if (!full) return { ok: false, error: 'nothing to back up' };
  try { await _t.upload(id, await dataUrlToBlob(full), { barcode, source }); return { ok: true }; }
  catch (err) { return { ok: false, error: err.message || 'upload failed' }; }
}

const LOOKUP_IMG = `${API_BASE}/api/pwa-lookup/image`;

/** Fetch a provider SUGGESTED image (via our CSP-safe proxy) as a data URL. null on any failure/offline. */
export async function fetchSuggestedImage(url) {
  if (!url) return null;
  try {
    const res = await fetch(`${LOOKUP_IMG}?url=${encodeURIComponent(url)}`, { headers: authHeader() });
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
  const dataUrl = await fetchSuggestedImage(suggested.imageLarge || suggested.image);
  if (!dataUrl) return null;
  const saved = await saveImage(dataUrl, { source: 'catalogue' });
  if (!saved.ok) return null;
  if (await backupAvailable()) backupImage(saved.id, { barcode, source: 'catalogue' });
  return { id: saved.id, source: 'catalogue', attribution: suggested.imageAttribution || null, updatedAt: Date.now() };
}

/** Fetch an image from the shop's server store into the local cache (for a device that doesn't hold it). */
export async function fetchImageToCache(id) {
  try {
    const blob = await _t.download(id);
    if (!blob) return { ok: false };
    const full = await blobToDataUrl(blob);
    const { thumb } = await processImage(full);
    putLocal(id, { full, thumb });
    return { ok: true, thumb };
  } catch { return { ok: false }; }
}
