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

// Bounded email for a limiter key: an attacker can POST a 128 KiB email within the 10 MiB body cap; keying on
// it verbatim would store 128 KiB per attempt in the limiter (audit M2). Truncate to the RFC-5321 max so the
// key is always small. (The auth service separately REJECTS an over-length email before doing any work.)
const MAX_EMAIL_KEY_LEN = 254;
function emailForKey(req) {
  const e = (req.body && typeof req.body.email === 'string' ? req.body.email : '').toLowerCase().trim();
  return e.length > MAX_EMAIL_KEY_LEN ? e.slice(0, MAX_EMAIL_KEY_LEN) : e;
}

// Login/register: key by (email + IP) so one shop's staff all logging in from the same IP don't exhaust a
// shared login budget, while a single email/IP still can't brute-force. Body is parsed before these run.
function emailIpKey(req) {
  return `${emailForKey(req) || 'anon'}|${ipKey(req)}`;
}

// Email ONLY (ignoring IP): bounds attempts against a SINGLE account from anywhere (distributed guessing of
// one password). Falls back to IP when no email is present so it never collapses to one global bucket.
function emailOnlyKey(req) {
  const e = emailForKey(req);
  return e ? `email:${e}` : ipKey(req);
}

const RATE_MSG = (code, message) => ({ success: false, error: { code, message } });
const COMMON = { windowMs: 60 * 1000, standardHeaders: true, legacyHeaders: false };

// ── Shared store for scaling OUT (>1 instance) ──────────────────────────────────────────────────────────
// express-rate-limit's default MemoryStore is PER PROCESS, so counters don't add up across Render instances
// (two instances each allow the full cap). This is correct for the current single instance. Before running
// MORE than one instance, install `rate-limit-redis` and set REDIS_URL — each limiter then shares a
// Redis-backed store (own key prefix). Until BOTH are present, makeStore() returns undefined and the limiter
// falls back to MemoryStore, so nothing changes today. See obsidian-vault/Deployment.md.
// (The login lockout in pwaAuthService is likewise per-process and must move to a shared store before scaling.)
let _rlClient = null; // null = not yet resolved; false = unavailable; else an ioredis client
function rlClient() {
  if (_rlClient !== null) return _rlClient || null;
  try {
    const Redis = require('ioredis'); // already a dependency
    _rlClient = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    _rlClient.on('error', () => { /* non-fatal: a Redis blip must never crash the API */ });
    return _rlClient;
  } catch { _rlClient = false; return null; }
}
function makeStore(prefix) {
  if (!process.env.REDIS_URL) return undefined; // single instance → MemoryStore
  let RedisStore;
  try { RedisStore = require('rate-limit-redis').default || require('rate-limit-redis'); }
  catch { return undefined; } // package not installed yet → MemoryStore (install it to scale out)
  const client = rlClient();
  if (!client) return undefined;
  return new RedisStore({ prefix: `rl:${prefix}:`, sendCommand: (...args) => client.call(...args) });
}

// General API limiter — per shop when authenticated, per IP otherwise. Skips /api/pwa-sync, which has its
// own (higher) bucket below so normal multi-device polling never trips the general cap.
const generalLimiter = rateLimit({
  ...COMMON,
  store: makeStore('general'),
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
  store: makeStore('sync'),
  max: isTest ? 1000000 : 300,
  keyGenerator: shopOrIpKey,
  message: RATE_MSG('RATE_LIMIT', 'Sync is busy — it will catch up in a moment.'),
});

// Login/register limiter — keyed by email+IP. Kept for compatibility; the credential routes now ALSO stack
// the two limiters below (per-IP across all emails, and per-email across all IPs) so neither dimension is
// unbounded.
const authLimiter = rateLimit({
  ...COMMON,
  store: makeStore('auth'),
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
  store: makeStore('login-ip'),
  max: isTest ? 100000 : 60,
  keyGenerator: ipKey,
  message: RATE_MSG('RATE_LIMIT', 'Too many attempts from this network — please wait a minute.'),
});

const loginEmailLimiter = rateLimit({
  ...COMMON,
  store: makeStore('login-email'),
  max: isTest ? 100000 : 10,
  keyGenerator: emailOnlyKey,
  message: RATE_MSG('RATE_LIMIT', 'Too many attempts for this account — please wait a minute.'),
});

// Register has its OWN budgets (separate limiter instances / store prefixes) so a burst of invalid
// registrations carrying a victim's email can't drain that victim's LOGIN bucket and lock a legitimate
// owner out from another network (audit M1). Same shapes as login, different buckets.
const registerIpLimiter = rateLimit({
  ...COMMON,
  store: makeStore('reg-ip'),
  max: isTest ? 100000 : 60,
  keyGenerator: ipKey,
  message: RATE_MSG('RATE_LIMIT', 'Too many attempts from this network — please wait a minute.'),
});

const registerEmailLimiter = rateLimit({
  ...COMMON,
  store: makeStore('reg-email'),
  max: isTest ? 100000 : 10,
  keyGenerator: emailOnlyKey,
  message: RATE_MSG('RATE_LIMIT', 'Too many registration attempts for this email — please wait a minute.'),
});

const strictLimiter = rateLimit({
  ...COMMON,
  store: makeStore('strict'),
  max: isTest ? 100000 : 5,
  keyGenerator: shopOrIpKey,
  message: RATE_MSG('RATE_LIMIT', 'Rate limit exceeded.'),
});

// Password-reset request + confirm get their OWN tight buckets (like register) so reset spam can't drain the
// login/register allowances, and so an attacker can't hammer the reset endpoints for one email or from one IP.
const resetIpLimiter = rateLimit({
  ...COMMON,
  store: makeStore('reset-ip'),
  max: isTest ? 100000 : 30,
  keyGenerator: ipKey,
  message: RATE_MSG('RATE_LIMIT', 'Too many attempts from this network — please wait a minute.'),
});
const resetEmailLimiter = rateLimit({
  ...COMMON,
  store: makeStore('reset-email'),
  max: isTest ? 100000 : 5,
  keyGenerator: emailOnlyKey,
  message: RATE_MSG('RATE_LIMIT', 'Too many password-reset attempts for this email — please wait a minute.'),
});

module.exports = {
  generalLimiter, authLimiter, strictLimiter, syncLimiter,
  loginIpLimiter, loginEmailLimiter, registerIpLimiter, registerEmailLimiter,
  resetIpLimiter, resetEmailLimiter,
  // exported for unit tests
  shopKeyFromToken, ipKey, shopOrIpKey, emailIpKey, emailOnlyKey, emailForKey,
};
