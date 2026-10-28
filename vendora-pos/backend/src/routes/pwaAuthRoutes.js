'use strict';

// PWA owner-account + staff routes (public auth; staff admin needs an owner token). Mounted at
// /api/pwa-auth. Separate from the till's /api/auth (ADR-002). Thin routes → pwaAuthService.
const express = require('express');

const router = express.Router();
const {
  loginIpLimiter, loginEmailLimiter, registerIpLimiter, registerEmailLimiter,
  resetIpLimiter, resetEmailLimiter, ipKey,
} = require('../middleware/rateLimit');
const pwaAuth = require('../services/pwaAuthService');

// Each endpoint stacks per-IP (across all emails) + per-email (across all IPs) limiters so neither
// credential stuffing from one IP nor distributed guessing of one account is unbounded (scale audit #1).
// Register has its OWN buckets so invalid registrations can't drain a victim's LOGIN allowance (audit M1).
const loginLimiters = [loginIpLimiter, loginEmailLimiter];
const registerLimiters = [registerIpLimiter, registerEmailLimiter];
const resetLimiters = [resetIpLimiter, resetEmailLimiter];

// POST /api/pwa-auth/register  { email, password, shopName }
router.post('/register', ...registerLimiters, async (req, res, next) => {
  try {
    const out = await pwaAuth.register(req.body || {});
    res.status(201).json({ success: true, ...out });
  } catch (err) { next(err); }
});

// POST /api/pwa-auth/login  { email, password }  (owner OR staff member)
router.post('/login', ...loginLimiters, async (req, res, next) => {
  try {
    const out = await pwaAuth.login(req.body || {}, { ip: ipKey(req) }); // lockout keyed by email+IP (#1)
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

// GET /api/pwa-auth/me  (Bearer access token) → shop + role + member
router.get('/me', async (req, res, next) => {
  try {
    const decoded = pwaAuth.verifyAccess(req.headers.authorization);
    const out = await pwaAuth.me(decoded);
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// ── Password recovery + in-app credential changes ────────────────────────────────────────────────────

// POST /api/pwa-auth/forgot-password  { email } → { emailConfigured } (enumeration-safe; always 200)
router.post('/forgot-password', ...resetLimiters, async (req, res, next) => {
  try {
    const out = await pwaAuth.requestPasswordReset((req.body || {}).email);
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// POST /api/pwa-auth/reset-password  { email, token, password } → signs in on success
router.post('/reset-password', ...resetLimiters, async (req, res, next) => {
  try {
    const out = await pwaAuth.resetPassword(req.body || {});
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// Authed gate: valid token + (for members) still-active. req.pwa carries the decoded payload.
async function authed(req, res, next) {
  try {
    req.pwa = pwaAuth.verifyAccess(req.headers.authorization);
    await pwaAuth.assertMemberActive(req.pwa);
    next();
  } catch (err) { next(err); }
}

// POST /api/pwa-auth/change-password  { currentPassword, newPassword }  (owner or member — own password)
router.post('/change-password', authed, async (req, res, next) => {
  try {
    const out = await pwaAuth.changePassword(req.pwa, req.body || {});
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// POST /api/pwa-auth/change-email  { password, newEmail }  (owner only)
router.post('/change-email', authed, async (req, res, next) => {
  try {
    pwaAuth.requireOwner(req.pwa);
    const out = await pwaAuth.changeEmail(req.pwa, req.body || {});
    res.json({ success: true, ...out });
  } catch (err) { next(err); }
});

// ── Staff administration (owner only) ────────────────────────────────────────────────────────────────
// Gate: require a valid PWA access token AND the owner role. The account id is the token's shopId, so an
// owner can only ever manage their own shop's staff.
function ownerGate(req, res, next) {
  try {
    const decoded = pwaAuth.verifyAccess(req.headers.authorization);
    pwaAuth.requireOwner(decoded);
    req.pwa = decoded;
    next();
  } catch (err) { next(err); }
}

// GET /api/pwa-auth/staff → { members: [...] }
router.get('/staff', ownerGate, async (req, res, next) => {
  try { res.json({ success: true, ...(await pwaAuth.listMembers(req.pwa.shopId)) }); }
  catch (err) { next(err); }
});

// POST /api/pwa-auth/staff  { email, name, role, password }
router.post('/staff', ownerGate, async (req, res, next) => {
  try { res.status(201).json({ success: true, ...(await pwaAuth.addMember(req.pwa.shopId, req.body || {})) }); }
  catch (err) { next(err); }
});

// PATCH /api/pwa-auth/staff/:id  { name?, role?, active?, password? }
router.patch('/staff/:id', ownerGate, async (req, res, next) => {
  try { res.json({ success: true, ...(await pwaAuth.updateMember(req.pwa.shopId, req.params.id, req.body || {})) }); }
  catch (err) { next(err); }
});

// DELETE /api/pwa-auth/staff/:id
router.delete('/staff/:id', ownerGate, async (req, res, next) => {
  try { res.json({ success: true, ...(await pwaAuth.removeMember(req.pwa.shopId, req.params.id)) }); }
  catch (err) { next(err); }
});

module.exports = router;
