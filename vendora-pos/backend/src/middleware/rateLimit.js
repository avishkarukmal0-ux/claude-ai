const { rateLimit } = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const config = require('./../config');

// Under the test runner, lift the caps so integration suites (which fire many auth calls from one IP)
// aren't throttled. Real limits always apply outside NODE_ENV=test.
const isTest = process.env.NODE_ENV === 'test';

// ── Keying ────────────────────────────────────────────────────────────────────
// A whole shop (owner + manager + up to ~7 staff phones) sits behind ONE public IP (shared mobile/NAT).
// Keying the limiter by IP therefore pools every device in the shop into a single bucket, so a busy shop
// trips a per-IP cap that was sized for a single client. When the request carries a valid PWA access token
// we key by the shop/account id instead, giving each SHOP its own budget regardless of how many devices it
// runs. Unauthenticated routes (login, register) have no token yet, so they stay keyed by IP.
//
// The token is fully verified here (same secret as pwaAuthService.verifyAccess), so a forged token can't
// borrow or poison another shop's bucket — an invalid token simply falls back to the IP key.
function shopKeyFromToken(req) {
  const h = req.headers && req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return null;
  try {
    const d = jwt.verify(h.slice(7), config.jwt.secret);
    if (d && d.typ === 'pwa' && d.shopId) return `shop:${d.shopId}`;
  } catch { /* invalid/expired token → fall back to IP */ }
  return null;
}

// IPv6 addresses must be grouped to a subnet, not keyed per-address (a single client cycles through many
// /128s). express-rate-limit doesn't export an ipKeyGenerator in this version, so group IPv6 to its /64
// ourselves; IPv4 is used whole.
function ipKey(req) {
  const ip = req.ip || '';
  if (ip.includes(':')) return ip.split(':').slice(0, 4).join(':') + '::/64';
  return ip;
}

// Authenticated → per-shop bucket; otherwise per-IP. Used by the general + sync limiters.
function shopOrIpKey(req) { return shopKeyFromToken(req) || ipKey(req); }

// Login/register: key by (email + IP) so one shop's staff all logging in from the same IP don't exhaust a
// shared login budget, while a single email/IP still can't brute-force. Body is parsed before these run.
function emailIpKey(req) {
  const email = (req.body && typeof req.body.email === 'string' ? req.body.email : '').toLowerCase().trim();
  return `${email || 'anon'}|${ipKey(req)}`;
}

// Email ONLY (ignoring IP): bounds attempts against a SINGLE account from anywhere (distributed guessing of
// one password). Falls back to IP when no email is present so it never collapses to one global bucket.
function emailOnlyKey(req) {
  const email = (req.body && typeof req.body.email === 'string' ? req.body.email : '').toLowerCase().trim();
  return email ? `email:${email}` : ipKey(req);
}

const RATE_MSG = (code, message) => ({ success: false, error: { code, message } });
const COMMON = { windowMs: 60 * 1000, standardHeaders: true, legacyHeaders: false };

// General API limiter — per shop when authenticated, per IP otherwise. Skips /api/pwa-sync, which has its
// own (higher) bucket below so normal multi-device polling never trips the general cap.
const generalLimiter = rateLimit({
  ...COMMON,
  max: isTest ? 100000 : 100,
  keyGenerator: shopOrIpKey,
  skip: (req) => (req.originalUrl || '').startsWith('/api/pwa-sync'),
  message: RATE_MSG('RATE_LIMIT', 'Too many requests, please try again later.'),
});

// Cross-device sync limiter — generous PER SHOP. A shop with ~7 active devices pulling on the active-edit
// cadence plus occasional pushes is well under this; it only bites a runaway/looping client. Keyed by shop
// (falls back to IP for the rare tokenless hit, which the route then 401s anyway).
const syncLimiter = rateLimit({
  ...COMMON,
  max: isTest ? 1000000 : 300,
  keyGenerator: shopOrIpKey,
  message: RATE_MSG('RATE_LIMIT', 'Sync is busy — it will catch up in a moment.'),
});

// Login/register limiter — keyed by email+IP. Kept for compatibility; the credential routes now ALSO stack
// the two limiters below (per-IP across all emails, and per-email across all IPs) so neither dimension is
// unbounded.
const authLimiter = rateLimit({
  ...COMMON,
  max: isTest ? 100000 : 10,
  keyGenerator: emailIpKey,
  message: RATE_MSG('RATE_LIMIT', 'Too many login attempts, please wait a minute.'),
});

// Credential endpoints (/login, /register) stack TWO limiters so neither axis is open:
//  - loginIpLimiter   caps TOTAL attempts from one IP across ALL emails (stops credential stuffing / mass
//    register from a single source — the email|ip key alone let one IP try unlimited different emails).
//  - loginEmailLimiter caps attempts against ONE email from ANY IP (stops distributed guessing of one account).
const loginIpLimiter = rateLimit({
  ...COMMON,
  max: isTest ? 100000 : 60,
  keyGenerator: ipKey,
  message: RATE_MSG('RATE_LIMIT', 'Too many attempts from this network — please wait a minute.'),
});

const loginEmailLimiter = rateLimit({
  ...COMMON,
  max: isTest ? 100000 : 10,
  keyGenerator: emailOnlyKey,
  message: RATE_MSG('RATE_LIMIT', 'Too many attempts for this account — please wait a minute.'),
});

const strictLimiter = rateLimit({
  ...COMMON,
  max: isTest ? 100000 : 5,
  keyGenerator: shopOrIpKey,
  message: RATE_MSG('RATE_LIMIT', 'Rate limit exceeded.'),
});

module.exports = {
  generalLimiter, authLimiter, strictLimiter, syncLimiter, loginIpLimiter, loginEmailLimiter,
  // exported for unit tests
  shopKeyFromToken, ipKey, shopOrIpKey, emailIpKey, emailOnlyKey,
};
