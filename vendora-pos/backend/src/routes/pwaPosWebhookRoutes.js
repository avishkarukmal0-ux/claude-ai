'use strict';

// Provider webhook receiver (sales-import slice 4 scaffolding). Mounted at /api/pwa-pos/webhooks/:provider,
// BEFORE the PWA-token-gated /api/pwa-pos router — webhooks come from the provider, not the shopkeeper's app,
// so they carry NO PWA token. Authenticity is proven by the provider's documented SIGNATURE instead, verified
// in the adapter.
//
// INERT BY DEFAULT: until a provider is accredited, configured and its verifyWebhook is implemented, this
// endpoint behaves as if it doesn't exist (404) — we never accept or store an unverified payload, and we never
// fabricate a success. The raw body is captured (express.raw) because signature verification needs the exact
// bytes; we deliberately do NOT json-parse before verifying.
const express = require('express');

const router = express.Router();
const posCloud = require('../services/posCloudService');

// Raw bytes for signature verification. A small cap: real POS webhooks are tiny JSON payloads.
const rawBody = express.raw({ type: '*/*', limit: '256kb' });

// POST /api/pwa-pos/webhooks/:provider
router.post('/:provider', rawBody, async (req, res) => {
  try {
    const result = await posCloud.receiveWebhook(req.params.provider, {
      rawBody: Buffer.isBuffer(req.body) ? req.body : Buffer.from(''),
      headers: req.headers,
    });
    if (!result.accepted) {
      // Not configured / no verified handler → look like a non-existent endpoint. Don't leak which providers
      // we might support or why; just 404.
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    }
    // (Unreachable today.) A verified + enqueued event returns 200 so the provider stops retrying.
    return res.json({ success: true });
  } catch (err) {
    // A verification failure (bad/absent signature, or the adapter's not-available) must NOT 500 — respond 400
    // so a misconfigured or spoofed sender gets a clear rejection, not a server error.
    return res.status(400).json({ success: false, error: { code: 'WEBHOOK_REJECTED' } });
  }
});

module.exports = router;
