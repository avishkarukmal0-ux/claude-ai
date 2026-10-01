'use strict';

// PWA notification routes (mandate #6). Mounted at /api/pwa-notify, always on (ADR-002). Preference +
// preview routes require a PWA access token; the scheduler trigger is protected by a shared secret so an
// external cron (Render Cron Job, cron-job.org, GitHub Action) can drive reliable, not-app-open-dependent
// delivery even when the instance would otherwise be idle. Thin routes → pwaNotifyService.
const express = require('express');

const router = express.Router();
const config = require('../config');
const AppError = require('../utils/AppError');
const pwaAuth = require('../services/pwaAuthService');
const notify = require('../services/pwaNotifyService');
const Account = require('../models/Account');

// ── External scheduler trigger (shared secret, no user token) ────────────────────────────────────────
// POST /api/pwa-notify/run   header: x-notify-token: <NOTIFY_RUN_TOKEN>
// Disabled (404) unless NOTIFY_RUN_TOKEN is set, so it can't be hit by accident in a default deploy.
router.post('/run', async (req, res, next) => {
  try {
    if (!config.notify.runToken) throw new AppError('Not found', 404, 'NOT_FOUND');
    const token = req.headers['x-notify-token'];
    if (token !== config.notify.runToken) throw new AppError('Forbidden', 403, 'FORBIDDEN');
    const out = await notify.runDue(Date.now());
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// Everything below needs a valid PWA access token.
router.use((req, res, next) => {
  try { req.pwa = pwaAuth.verifyAccess(req.headers.authorization); next(); }
  catch (err) { next(err); }
});

// GET /api/pwa-notify/prefs → { configured, prefs }
router.get('/prefs', async (req, res, next) => {
  try {
    const account = await Account.findById(req.pwa.shopId);
    if (!account) throw new AppError('Account not found', 404, 'NOT_FOUND');
    res.json({ success: true, configured: notify.emailConfigured(), prefs: account.notify || {} });
  } catch (err) { next(err); }
});

const NUM = (v, lo, hi, dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(n)));
};

// PUT /api/pwa-notify/prefs  { email:{enabled}, categories, expiryDays, sendHour, quietFrom, quietTo,
//                              snoozeUntil, recipient }  (owner or manager)
router.put('/prefs', async (req, res, next) => {
  try {
    if (req.pwa.role === 'staff') throw new AppError('Not allowed', 403, 'FORBIDDEN');
    const account = await Account.findById(req.pwa.shopId);
    if (!account) throw new AppError('Account not found', 404, 'NOT_FOUND');
    const b = req.body || {};
    const n = account.notify || {};

    if (b.email && typeof b.email.enabled === 'boolean') n.email = { enabled: b.email.enabled };
    if (b.categories) {
      n.categories = {
        expiry: b.categories.expiry !== false,
        claims: b.categories.claims !== false,
        tasks: b.categories.tasks !== false,
      };
    }
    if (b.expiryDays != null) n.expiryDays = NUM(b.expiryDays, 0, 60, 3);
    if (b.sendHour != null) n.sendHour = NUM(b.sendHour, 0, 23, 7);
    if (b.quietFrom != null) n.quietFrom = NUM(b.quietFrom, 0, 23, 21);
    if (b.quietTo != null) n.quietTo = NUM(b.quietTo, 0, 23, 7);
    if (b.snoozeUntil != null) n.snoozeUntil = Math.max(0, Number(b.snoozeUntil) || 0);
    if (b.recipient != null) n.recipient = String(b.recipient).trim().slice(0, 200);

    account.notify = n;
    account.markModified('notify');
    await account.save();
    res.json({ success: true, configured: notify.emailConfigured(), prefs: account.notify });
  } catch (err) { next(err); }
});

// GET /api/pwa-notify/preview → the digest that WOULD be sent right now (no send, no state change).
router.get('/preview', async (req, res, next) => {
  try {
    const digest = await notify.previewForAccount(req.pwa.shopId, Date.now());
    if (!digest) throw new AppError('Account not found', 404, 'NOT_FOUND');
    res.json({ success: true, configured: notify.emailConfigured(), digest });
  } catch (err) { next(err); }
});

module.exports = router;
