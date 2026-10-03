'use strict';

// PWA document-backup routes (Phase 3). Mounted at /api/pwa-docs. Cross-device backup of invoice
// photos/PDFs. Every route requires a valid PWA access token; the token's account id scopes all files, so a
// shop can only ever read/delete its own. Invoice documents are financial, so these are owner/manager only
// (mirrors the FINANCIAL_STORES rule). OFF unless DOC_BACKUP=true. Thin routes → pwaDocService.
const express = require('express');
const multer = require('multer');

const router = express.Router();
const pwaAuth = require('../services/pwaAuthService');
const docs = require('../services/pwaDocService');
const config = require('../config');
const AppError = require('../utils/AppError');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.docBackup.maxBytes } });

// Auth gate: valid token + (for staff/manager) member still active. req.pwa carries the live role.
router.use(async (req, res, next) => {
  try {
    req.pwa = pwaAuth.verifyAccess(req.headers.authorization);
    await pwaAuth.assertMemberActive(req.pwa);
    next();
  } catch (err) { next(err); }
});

// Invoice documents are financial — staff may not back them up, read or delete them.
function ownerOrManager(req, res, next) {
  const role = req.pwa && req.pwa.role;
  if (role === 'owner' || role === 'manager' || role == null) return next(); // guest/legacy owner has no role
  return next(new AppError('Not allowed for your role.', 403, 'FORBIDDEN_ROLE'));
}

// GET /api/pwa-docs/status → { success, enabled, provider, maxBytes }
router.get('/status', (req, res) => {
  res.json({ success: true, enabled: docs.isEnabled(), provider: config.docBackup.provider, maxBytes: config.docBackup.maxBytes });
});

// GET /api/pwa-docs/invoice → { success, files: [{ fileId, size, uploadedAt, invoiceId }] }
router.get('/invoice', ownerOrManager, async (req, res, next) => {
  try { res.json({ success: true, ...(await docs.list(req.pwa.sub)) }); }
  catch (err) { next(err); }
});

// POST /api/pwa-docs/invoice/:fileId  (multipart: file=<binary>, invoiceId=<string?>) → { success, ... }
router.post('/invoice/:fileId', ownerOrManager, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file provided.', 400, 'NO_FILE');
    const out = await docs.upload(req.pwa.sub, req.params.fileId, {
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      invoiceId: (req.body && req.body.invoiceId) || null,
    });
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// GET /api/pwa-docs/invoice/:fileId → streams the file bytes (404 if not found / not this shop's).
router.get('/invoice/:fileId', ownerOrManager, async (req, res, next) => {
  try {
    const file = await docs.download(req.pwa.sub, req.params.fileId);
    if (!file) throw new AppError('Document not found.', 404, 'DOC_NOT_FOUND');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.buffer);
  } catch (err) { next(err); }
});

// DELETE /api/pwa-docs/invoice/:fileId → { success, deleted }
router.delete('/invoice/:fileId', ownerOrManager, async (req, res, next) => {
  try { res.json({ success: true, ...(await docs.remove(req.pwa.sub, req.params.fileId)) }); }
  catch (err) { next(err); }
});

module.exports = router;
