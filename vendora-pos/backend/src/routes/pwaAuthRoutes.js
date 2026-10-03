'use strict';

// PWA owner-account + staff routes (public auth; staff admin needs an owner token). Mounted at
// /api/pwa-auth. Separate from the till's /api/auth (ADR-002). Thin routes → pwaAuthService.
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

// POST /api/pwa-auth/login  { email, password }  (owner OR staff member)
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

// GET /api/pwa-auth/me  (Bearer access token) → shop + role + member
router.get('/me', async (req, res, next) => {
  try {
    const decoded = pwaAuth.verifyAccess(req.headers.authorization);
    const out = await pwaAuth.me(decoded);
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
