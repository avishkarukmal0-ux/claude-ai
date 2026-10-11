'use strict';

// Product-picture storage (core feature). Cross-device backup of a shop's product photos. Same GridFS
// approach as the invoice-doc store (chunked, no extra service/secret), but a SEPARATE bucket, its own flag,
// image-only validation, and open to ALL roles (adding a shelf photo is a shop-floor task, not a money one).
//
// SHOP ISOLATION: every image is tagged with the authenticated account id; every read/delete filters on it.
// The owner's photo is authoritative on-device; this is the secure, shop-scoped copy that reaches other
// devices. Thumbnails are generated + cached on the client for offline use — the server keeps one image per
// product id. Thin routes → this service.
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const config = require('../config');
const { nextRev, pickLatest, revOf } = require('./backupRev');

const BUCKET = 'pwa_product_images';
const REV_NS = 'img'; // namespace the rev counter per bucket so doc/image slots never share a counter

function isEnabled() { return !!config.productImages.enabled; }
function assertEnabled() {
  if (!isEnabled()) throw new AppError('Product-image backup is not enabled on the server.', 503, 'PRODUCT_IMAGES_DISABLED');
}

function bucket() {
  const db = mongoose.connection && mongoose.connection.db;
  if (!db) throw new AppError('Storage is not ready — try again shortly.', 503, 'DB_NOT_READY');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET });
}

function validate({ contentType, size }) {
  if (!config.productImages.allowedTypes.includes(contentType)) {
    throw new AppError(`Unsupported image type (${contentType || 'unknown'}). Use a JPEG, PNG or WebP photo.`, 400, 'BAD_IMAGE_TYPE');
  }
  if (!(size > 0)) throw new AppError('Empty image.', 400, 'EMPTY_IMAGE');
  if (size > config.productImages.maxBytes) {
    throw new AppError(`Image too large (max ${Math.round(config.productImages.maxBytes / (1024 * 1024))}MB after compression).`, 413, 'IMAGE_TOO_LARGE');
  }
}

function nameFor(accountId, fileId) { return `${accountId}:${fileId}`; }

async function findOwned(accountId, fileId) {
  const files = await bucket().find({ filename: nameFor(accountId, fileId), 'metadata.accountId': accountId }).toArray();
  return pickLatest(files); // highest-rev = canonical version all writers agree on (audit B2)
}

async function removeAll(accountId, fileId) {
  const b = bucket();
  const files = await b.find({ filename: nameFor(accountId, fileId), 'metadata.accountId': accountId }).toArray();
  for (const f of files) { try { await b.delete(f._id); } catch { /* already gone */ } }
  return files.length;
}

/**
 * Remove copies of (account,fileId) whose rev is strictly LOWER than keepRev — never the just-committed file
 * (rev === keepRev) nor a competing newer (higher) rev. Each upload claims a strictly-increasing rev from an
 * atomic counter (audit B2), so all writers agree on the order: two simultaneous replacements can't delete each
 * other's winner, the highest rev always survives, and legacy rev-0 copies are superseded by the first real upload.
 */
async function removeLowerRev(accountId, fileId, keepRev) {
  const b = bucket();
  const files = await b.find({ filename: nameFor(accountId, fileId), 'metadata.accountId': accountId }).toArray();
  let removed = 0;
  for (const f of files) { if (revOf(f) < keepRev) { try { await b.delete(f._id); removed += 1; } catch { /* gone */ } } }
  return removed;
}

/** Store (replace) a product image for an account. Idempotent per (accountId, fileId) — a re-upload replaces. */
async function upload(accountId, fileId, { buffer, contentType, barcode = null, source = 'owner' }) {
  assertEnabled();
  if (!accountId) throw new AppError('Not authorised.', 401, 'NO_ACCOUNT');
  if (!fileId) throw new AppError('Missing image id.', 400, 'NO_IMAGE_ID');
  const size = buffer ? buffer.length : 0;
  validate({ contentType, size });
  // Audit S4: upload the NEW copy first, then remove the old ones — so a failed upload can't destroy the only
  // backup. On error, clean up the partial write and keep the previous copy intact.
  const b = bucket();
  const rev = await nextRev(`${REV_NS}:${accountId}:${fileId}`); // audit B2: atomic canonical ordering
  let newId = null;
  try {
    newId = await new Promise((resolve, reject) => {
      const stream = b.openUploadStream(nameFor(accountId, fileId), {
        contentType,
        metadata: { accountId, fileId, barcode, source, contentType, rev, uploadedAt: new Date() },
      });
      stream.on('error', reject);
      stream.on('finish', () => resolve(stream.id));
      stream.end(buffer);
    });
  } catch (err) {
    if (newId) { try { await b.delete(newId); } catch { /* ignore */ } }
    throw new AppError(`Upload failed — your previous copy is unchanged. (${err.message})`, 502, 'UPLOAD_FAILED');
  }
  await removeLowerRev(accountId, fileId, rev); // drop only strictly-lower revs (never a competing higher one)
  return { ok: true, fileId, size, contentType };
}

/** Fetch a product image for an account (isolation enforced). { buffer, contentType } or null. */
async function download(accountId, fileId) {
  assertEnabled();
  const file = await findOwned(accountId, fileId);
  if (!file) return null;
  const chunks = [];
  await new Promise((resolve, reject) => {
    bucket().openDownloadStream(file._id)
      .on('data', (c) => chunks.push(c))
      .on('error', reject)
      .on('end', resolve);
  });
  return { buffer: Buffer.concat(chunks), contentType: (file.metadata && file.metadata.contentType) || file.contentType || 'application/octet-stream' };
}

async function remove(accountId, fileId) {
  assertEnabled();
  const deleted = await removeAll(accountId, fileId);
  return { ok: true, deleted };
}

async function list(accountId) {
  assertEnabled();
  const files = await bucket().find({ 'metadata.accountId': accountId }).toArray();
  const winners = new Map(); // fileId -> canonical (highest-rev) GridFS file
  for (const f of files) {
    const id = f.metadata && f.metadata.fileId;
    if (!id) continue;
    const cur = winners.get(id);
    if (!cur || revOf(f) > revOf(cur) || (revOf(f) === revOf(cur) && String(f._id) > String(cur._id))) winners.set(id, f);
  }
  const out = [...winners.values()].map((f) => ({
    fileId: f.metadata.fileId, size: f.length, barcode: (f.metadata && f.metadata.barcode) || null, source: (f.metadata && f.metadata.source) || null, uploadedAt: (f.metadata && f.metadata.uploadedAt) || f.uploadDate,
  }));
  return { files: out };
}

module.exports = { isEnabled, upload, download, remove, list, validate, BUCKET };
