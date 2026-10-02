'use strict';

// PWA product-image routes (core feature). Mounted at /api/pwa-images. Cross-device backup of product
// photos. Every route needs a valid PWA token; the token's account id scopes all images (shop isolation).
// Open to ALL roles — adding a product photo is an everyday shop-floor task, not a financial one. OFF unless
// PRODUCT_IMAGES=true (routes then report enabled:false / 503). Thin routes → productImageService.
const express = require('express');
const multer = require('multer');

const router = express.Router();
const pwaAuth = require('../services/pwaAuthService');
const images = require('../services/productImageService');
const config = require('../config');
const AppError = require('../utils/AppError');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.productImages.maxBytes } });

router.use(async (req, res, next) => {
  try {
    req.pwa = pwaAuth.verifyAccess(req.headers.authorization);
    await pwaAuth.assertMemberActive(req.pwa);
    next();
  } catch (err) { next(err); }
});

// GET /api/pwa-images/status → { success, enabled, maxBytes }
router.get('/status', (req, res) => {
  res.json({ success: true, enabled: images.isEnabled(), provider: config.productImages.provider, maxBytes: config.productImages.maxBytes });
});

// GET /api/pwa-images → { success, files: [{ fileId, size, barcode, source, uploadedAt }] }
router.get('/', async (req, res, next) => {
  try { res.json({ success: true, ...(await images.list(req.pwa.sub)) }); }
  catch (err) { next(err); }
});

// POST /api/pwa-images/:fileId  (multipart: file=<binary>, barcode?, source?) → { success, ... }
router.post('/:fileId', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No image provided.', 400, 'NO_IMAGE');
    const out = await images.upload(req.pwa.sub, req.params.fileId, {
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      barcode: (req.body && req.body.barcode) || null,
      source: (req.body && req.body.source) || 'owner',
    });
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// GET /api/pwa-images/:fileId → streams the image bytes (404 if not found / not this shop's).
router.get('/:fileId', async (req, res, next) => {
  try {
    const file = await images.download(req.pwa.sub, req.params.fileId);
    if (!file) throw new AppError('Image not found.', 404, 'IMAGE_NOT_FOUND');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400'); // private per shop, cacheable a day
    res.send(file.buffer);
  } catch (err) { next(err); }
});

// DELETE /api/pwa-images/:fileId → { success, deleted }
router.delete('/:fileId', async (req, res, next) => {
  try { res.json({ success: true, ...(await images.remove(req.pwa.sub, req.params.fileId)) }); }
  catch (err) { next(err); }
});

module.exports = router;
