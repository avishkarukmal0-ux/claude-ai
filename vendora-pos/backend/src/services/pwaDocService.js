'use strict';

// PWA document backup service (Phase 3) — cross-device backup of invoice photos/PDFs.
//
// WHY A DEDICATED STORE: invoice files are multi-MB binaries. They must NOT ride the per-store JSON sync
// blobs (those are small opaque strings; a base64 photo would bloat every pull). Instead they go to proper
// file storage. Default provider is GridFS (MongoDB's chunked file store) — no extra service or secret
// beyond the Mongo connection the app already has. The provider seam (`config.docBackup.provider`) leaves
// room for S3/object storage later without touching callers.
//
// SHOP ISOLATION: every file is tagged with the authenticated account id in its metadata, and every read /
// delete filters on it — one shop can never fetch or remove another shop's document. Thin routes → service.
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const config = require('../config');

const BUCKET = 'pwa_invoice_files';

function isEnabled() { return !!config.docBackup.enabled; }

function assertEnabled() {
  if (!isEnabled()) throw new AppError('Document backup is not enabled on the server.', 503, 'DOC_BACKUP_DISABLED');
}

function bucket() {
  const db = mongoose.connection && mongoose.connection.db;
  if (!db) throw new AppError('Storage is not ready — try again shortly.', 503, 'DB_NOT_READY');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET });
}

/** Validate a file's declared type + size before storing. Returns nothing; throws AppError on failure. */
function validate({ contentType, size }) {
  if (!config.docBackup.allowedTypes.includes(contentType)) {
    throw new AppError(`Unsupported file type (${contentType || 'unknown'}). Allowed: photo or PDF.`, 400, 'BAD_FILE_TYPE');
  }
  if (!(size > 0)) throw new AppError('Empty file.', 400, 'EMPTY_FILE');
  if (size > config.docBackup.maxBytes) {
    throw new AppError(`File too large (max ${Math.round(config.docBackup.maxBytes / (1024 * 1024))}MB).`, 413, 'FILE_TOO_LARGE');
  }
}

// A file's canonical GridFS filename is derived from account + client fileId so re-upload (retry) can find
// and replace cleanly. Isolation never relies on the filename alone — metadata.accountId is always checked.
function nameFor(accountId, fileId) { return `${accountId}:${fileId}`; }

/** Find a stored file for THIS account (isolation enforced via metadata.accountId). null if none. */
async function findOwned(accountId, fileId) {
  const files = await bucket().find({ filename: nameFor(accountId, fileId), 'metadata.accountId': accountId }).toArray();
  return files && files.length ? files[files.length - 1] : null; // newest if duplicates slipped in
}

/** Remove every stored copy of (account,fileId). Safe to call when none exist. */
async function removeAll(accountId, fileId) {
  const b = bucket();
  const files = await b.find({ filename: nameFor(accountId, fileId), 'metadata.accountId': accountId }).toArray();
  for (const f of files) { try { await b.delete(f._id); } catch { /* already gone */ } }
  return files.length;
}

/**
 * Store (or replace) a file for an account. Idempotent per (accountId, fileId): a retry replaces the prior
 * copy rather than duplicating, so an interrupted upload can be safely re-run.
 * @returns {{ ok, fileId, size, contentType }}
 */
async function upload(accountId, fileId, { buffer, contentType, invoiceId = null }) {
  assertEnabled();
  if (!accountId) throw new AppError('Not authorised.', 401, 'NO_ACCOUNT');
  if (!fileId) throw new AppError('Missing file id.', 400, 'NO_FILE_ID');
  const size = buffer ? buffer.length : 0;
  validate({ contentType, size });

  await removeAll(accountId, fileId); // replace-on-retry, no duplicates
  const b = bucket();
  await new Promise((resolve, reject) => {
    const stream = b.openUploadStream(nameFor(accountId, fileId), {
      contentType,
      metadata: { accountId, fileId, invoiceId, contentType, uploadedAt: new Date() },
    });
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(buffer);
  });
  return { ok: true, fileId, size, contentType };
}

/**
 * Fetch a file for an account. Returns { buffer, contentType } or null if not found / not owned by this
 * account (isolation). Reads the whole file into memory (invoice files are capped small).
 */
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

/** Delete a file for an account (only if owned). @returns {{ ok, deleted }} */
async function remove(accountId, fileId) {
  assertEnabled();
  const deleted = await removeAll(accountId, fileId);
  return { ok: true, deleted };
}

/** List the client fileIds this account has backed up (for "is it backed up?" status). */
async function list(accountId) {
  assertEnabled();
  const files = await bucket().find({ 'metadata.accountId': accountId }).toArray();
  const byId = new Map();
  for (const f of files) {
    const id = f.metadata && f.metadata.fileId;
    if (id) byId.set(id, { fileId: id, size: f.length, uploadedAt: (f.metadata && f.metadata.uploadedAt) || f.uploadDate, invoiceId: (f.metadata && f.metadata.invoiceId) || null });
  }
  return { files: [...byId.values()] };
}

module.exports = { isEnabled, upload, download, remove, list, validate, BUCKET };
