'use strict';

// PWA owner-account routes (public, no Staff auth). Mounted at /api/pwa-auth.
// Separate from the till's /api/auth (ADR-002). Thin routes → pwaAuthService.
const express = require('express');

const router = express.Router();
const { authLimiter } = require('../middleware/rateLimit');
const pwaAuth = require('../services/pwaAuthService');

// POST /api/pwa-auth/register  { email, password, shopName }
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const out = await pwaAuth.register(req.body || {});
    res.status(201).json({ success: true, ...out });
  } catch (err) { next(err); }
});

// POST /api/pwa-auth/login  { email, password }
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const out = await pwaAuth.login(req.body || {});
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// POST /api/pwa-auth/refresh  { refreshToken }
router.post('/refresh', async (req, res, next) => {
  try {
    const out = await pwaAuth.refresh((req.body || {}).refreshToken);
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// GET /api/pwa-auth/me  (Bearer access token)
router.get('/me', async (req, res, next) => {
  try {
    const decoded = pwaAuth.verifyAccess(req.headers.authorization);
    const out = await pwaAuth.me(decoded.sub);
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

module.exports = router;
