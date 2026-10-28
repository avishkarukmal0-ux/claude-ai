'use strict';

// PWA owner-account auth service (infra Stage 2b + staff access).
//
// Two kinds of identity sign in through the SAME /api/pwa-auth endpoints:
//  - the OWNER  — the PwaAccount itself (email + password). role = 'owner'.
//  - a MEMBER   — a PwaMember the owner created (their own email + password). role = 'manager' | 'staff'.
//
// Both get a token whose `shopId` is the OWNER account id, so everyone works inside that one shop's
// workspace and sync scoping (by shopId) keeps every shop's data isolated. The token also carries the
// signed-in person's `role`, member id (`mid`) and `name` so the app can gate owner-only screens and
// attribute actions. Role permissions are ENFORCED on the backend (see pwaSyncService) — the client
// gating is only UX. Tokens carry `typ: 'pwa'` so they can never be confused with the till's Staff tokens.
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const Account = require('../models/Account');
const Member = require('../models/Member');
const emailService = require('./emailService');

const RESET_TTL_MS = 60 * 60 * 1000; // a reset link is valid for 1 hour

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// Identity carried in every token. For the owner, mid === shopId. `tv` is the member's token version (S6):
// it's stamped into both tokens so a password reset / revoke (which bumps the member's tokenVersion) instantly
// invalidates every previously issued token for that member.
function tokensFor({ shopId, role, memberId, name, tv = 0 }) {
  const base = { sub: shopId, shopId, role, mid: memberId, name, tv };
  const accessToken = jwt.sign({ ...base, typ: 'pwa' }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const refreshToken = jwt.sign(
    { sub: shopId, shopId, role, mid: memberId, tv, typ: 'pwa-refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn },
  );
  return { accessToken, refreshToken };
}

function shapeShop(account) {
  return { id: account._id.toString(), name: account.shopName };
}
function shapeMember(m) {
  return { id: m._id.toString(), name: m.name, role: m.role, email: m.email, active: m.active !== false };
}
// The owner presented as a "member" so the client has one consistent identity shape.
function ownerAsMember(account) {
  return { id: account._id.toString(), name: 'Owner', role: 'owner', email: account.email, active: true };
}

async function emailInUse(lower, { exceptMemberId } = {}) {
  const acct = await Account.findOne({ email: lower }).select('_id').lean();
  if (acct) return true;
  const memberQuery = { email: lower };
  if (exceptMemberId) memberQuery._id = { $ne: exceptMemberId };
  const mem = await Member.findOne(memberQuery).select('_id').lean();
  return !!mem;
}

async function register({ email, password, shopName } = {}) {
  if (!email || !EMAIL_RE.test(String(email))) throw AppError.validation('A valid email is required');
  if (!password || String(password).length < MIN_PASSWORD) {
    throw AppError.validation(`Password must be at least ${MIN_PASSWORD} characters`);
  }
  if (!shopName || !String(shopName).trim()) throw AppError.validation('Shop name is required');

  const lower = String(email).toLowerCase();
  if (await emailInUse(lower)) throw new AppError('That email is already registered', 409, 'ACCOUNT_EXISTS');

  const passwordHash = await Account.hashPassword(password);
  const account = await Account.create({ email: lower, passwordHash, shopName: String(shopName).trim() });
  const { accessToken, refreshToken } = tokensFor({ shopId: account._id.toString(), role: 'owner', memberId: account._id.toString(), name: 'Owner', tv: account.tokenVersion || 0 });
  return { token: accessToken, refreshToken, shop: shapeShop(account), role: 'owner', member: ownerAsMember(account) };
}

// ── Self-service password reset + in-app credential changes ──────────────────────────────────────────

/**
 * Begin a password reset for an OWNER account. ENUMERATION-SAFE: always resolves the same shape whether or
 * not the email exists — it never reveals which emails are registered. If the account exists we store a hashed
 * single-use token and (when email delivery is configured) send the reset link. `emailConfigured` tells the
 * client whether a link can actually be sent, so the UI can be honest rather than say "check your email" when
 * nothing will arrive. Members are reset by their owner via staff admin, so they get the generic response too.
 */
async function requestPasswordReset(email) {
  const emailConfigured = emailService.isConfigured();
  if (!email || !EMAIL_RE.test(String(email)) || String(email).length > MAX_EMAIL_LEN) return { emailConfigured };
  const lower = String(email).toLowerCase();
  const account = await Account.findOne({ email: lower });
  if (account) {
    const token = crypto.randomBytes(32).toString('hex');
    account.resetTokenHash = Account.hashResetToken(token);
    account.resetTokenExpiresAt = Date.now() + RESET_TTL_MS;
    await account.save();
    if (emailConfigured) {
      const base = String(config.frontendUrl || '').replace(/\/+$/, '');
      const link = `${base}/account?reset=${token}&email=${encodeURIComponent(lower)}`;
      try {
        await emailService.send({
          to: lower,
          subject: 'Reset your Vendora password',
          text: `Someone asked to reset the password for your Vendora shop account.\n\nReset it here (valid for 1 hour):\n${link}\n\nIf this wasn't you, you can ignore this email — your password hasn't changed.`,
          html: `<p>Someone asked to reset the password for your Vendora shop account.</p>`
            + `<p><a href="${link}">Reset your password</a> (valid for 1 hour).</p>`
            + `<p>If this wasn't you, you can ignore this email — your password hasn't changed.</p>`,
        });
      } catch (err) { logger.error(`Password-reset email failed: ${err.message}`); }
    }
  }
  return { emailConfigured };
}

/** Complete a password reset with a valid, unexpired token. Bumps tokenVersion (invalidating every existing
 *  session) and signs the owner straight in. The token is single-use (cleared here). */
async function resetPassword({ email, token, password } = {}) {
  if (!email || !token) throw new AppError('This reset link is invalid or has expired', 400, 'RESET_INVALID');
  if (!password || String(password).length < MIN_PASSWORD) throw AppError.validation(`Password must be at least ${MIN_PASSWORD} characters`);
  const lower = String(email).toLowerCase();
  const account = await Account.findOne({ email: lower });
  const given = Account.hashResetToken(token);
  const stored = account && account.resetTokenHash;
  const fresh = account && account.resetTokenExpiresAt && account.resetTokenExpiresAt > Date.now();
  const match = !!stored && stored.length === given.length
    && crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(given));
  if (!account || !fresh || !match) throw new AppError('This reset link is invalid or has expired', 400, 'RESET_INVALID');

  account.passwordHash = await Account.hashPassword(password);
  account.tokenVersion = (account.tokenVersion || 0) + 1; // kill every session minted before the reset
  account.resetTokenHash = null;
  account.resetTokenExpiresAt = null;
  await account.save();
  const shopId = account._id.toString();
  const { accessToken, refreshToken } = tokensFor({ shopId, role: 'owner', memberId: shopId, name: 'Owner', tv: account.tokenVersion });
  return { token: accessToken, refreshToken, shop: shapeShop(account), role: 'owner', member: ownerAsMember(account) };
}

/** Change the signed-in person's own password (owner OR member). Verifies the current password, bumps the
 *  relevant tokenVersion (logging OTHER sessions out), and returns fresh tokens so the CURRENT session stays
 *  signed in. */
async function changePassword(decoded, { currentPassword, newPassword } = {}) {
  if (!newPassword || String(newPassword).length < MIN_PASSWORD) throw AppError.validation(`Password must be at least ${MIN_PASSWORD} characters`);
  if (isOwnerToken(decoded)) {
    const account = await Account.findById(decoded.shopId);
    if (!account) throw new AppError('Account not found', 404, 'NOT_FOUND');
    if (!await account.verifyPassword(currentPassword)) throw AppError.authInvalidCredentials('Current password is incorrect');
    account.passwordHash = await Account.hashPassword(newPassword);
    account.tokenVersion = (account.tokenVersion || 0) + 1;
    await account.save();
    const shopId = account._id.toString();
    const { accessToken, refreshToken } = tokensFor({ shopId, role: 'owner', memberId: shopId, name: 'Owner', tv: account.tokenVersion });
    return { token: accessToken, refreshToken, shop: shapeShop(account), role: 'owner', member: ownerAsMember(account) };
  }
  const member = await Member.findById(decoded.mid);
  if (!member || member.active === false || member.account.toString() !== decoded.shopId) throw new AppError('Access has been revoked', 401, 'AUTH_TOKEN_EXPIRED');
  if (!await member.verifyPassword(currentPassword)) throw AppError.authInvalidCredentials('Current password is incorrect');
  member.passwordHash = await Member.hashPassword(newPassword);
  member.tokenVersion = (member.tokenVersion || 0) + 1;
  await member.save();
  invalidateMember(member._id.toString());
  const owner = await Account.findById(member.account);
  if (!owner) throw new AppError('Account not found', 404, 'NOT_FOUND');
  const shopId = owner._id.toString();
  const { accessToken, refreshToken } = tokensFor({ shopId, role: member.role, memberId: member._id.toString(), name: member.name, tv: member.tokenVersion });
  return { token: accessToken, refreshToken, shop: shapeShop(owner), role: member.role, member: shapeMember(member) };
}

/** Change the OWNER account's login email. Verifies the current password and rejects an email already used by
 *  any account or member. (The route enforces owner-only; members' emails are managed by the owner.) */
async function changeEmail(decoded, { password, newEmail } = {}) {
  if (!newEmail || !EMAIL_RE.test(String(newEmail))) throw AppError.validation('A valid email is required');
  if (String(newEmail).length > MAX_EMAIL_LEN) throw AppError.validation('Email is too long');
  const account = await Account.findById(decoded.shopId);
  if (!account) throw new AppError('Account not found', 404, 'NOT_FOUND');
  if (!await account.verifyPassword(password)) throw AppError.authInvalidCredentials('Password is incorrect');
  const lower = String(newEmail).toLowerCase();
  if (lower !== account.email && await emailInUse(lower)) throw new AppError('That email is already in use', 409, 'ACCOUNT_EXISTS');
  account.email = lower;
  await account.save();
  return { shop: shapeShop(account), role: 'owner', member: ownerAsMember(account) };
}

// ── Temporary login lockout (defence in depth; the rate limiters are the primary control) ───────────────
// After LOCKOUT_MAX consecutive failures for one (email + source IP) within the window, further attempts from
// THAT SOURCE are refused for LOCKOUT_MS regardless of password — slowing a sustained online guess from one
// place. Keyed by email+IP (not email alone) so a remote attacker who knows an owner's email can NOT lock the
// real owner out at their own shop; distributed guessing across many IPs is bounded by the per-email rate
// limiter instead. In-memory (per instance; resets on restart) and cleared on a correct login.
// ⚠️ Per-process: before scaling to >1 instance this must move to a shared store (Redis/Mongo) — see
// obsidian-vault/Deployment.md "Scaling out requires shared rate-limit + lockout state".
const LOCKOUT_MAX = parseInt(process.env.PWA_LOGIN_LOCKOUT_MAX, 10) || 10;
const LOCKOUT_MS = (parseInt(process.env.PWA_LOGIN_LOCKOUT_MINUTES, 10) || 15) * 60 * 1000;
const LOCKOUT_MAX_ENTRIES = parseInt(process.env.PWA_LOGIN_LOCKOUT_MAX_ENTRIES, 10) || 50000; // hard cap (M2)
const MAX_EMAIL_LEN = 254; // RFC 5321 — reject longer BEFORE any key insertion / hashing (M2)
const _loginFails = new Map(); // `${email}|${ip}` -> { count, until, at }

const lockoutKey = (email, ip) => `${email}|${ip || ''}`;

/** Test hook: clear the login-lockout state. */
function __clearLoginLockout() { _loginFails.clear(); }

/**
 * Drop stale lockout entries so attacker-created keys for nonexistent accounts can't accumulate forever
 * (audit M2): keep only entries that are still actively locked OR were touched within the window. Runs on a
 * timer and opportunistically on each failure. Exposed for deterministic tests (pass `now`).
 */
function sweepLockouts(now = Date.now()) {
  for (const [k, rec] of _loginFails) {
    const lockActive = rec.until && rec.until > now;
    const recentlyTouched = (rec.at || 0) > now - LOCKOUT_MS;
    if (!lockActive && !recentlyTouched) _loginFails.delete(k);
  }
}
// Periodic sweep; unref'd so it never holds the process open, and disabled under the test runner.
if (process.env.NODE_ENV !== 'test') {
  const t = setInterval(() => sweepLockouts(), Math.max(60000, LOCKOUT_MS));
  if (typeof t.unref === 'function') t.unref();
}

function assertNotLockedOut(key) {
  const rec = _loginFails.get(key);
  if (rec && rec.until && rec.until > Date.now()) {
    const mins = Math.ceil((rec.until - Date.now()) / 60000);
    throw new AppError(`Too many failed attempts — try again in about ${mins} minute${mins === 1 ? '' : 's'}.`, 429, 'ACCOUNT_LOCKED');
  }
}
function noteLoginFailure(key) {
  const now = Date.now();
  const rec = _loginFails.get(key) || { count: 0, until: 0, at: now };
  rec.count += 1;
  rec.at = now;
  if (rec.count >= LOCKOUT_MAX) { rec.until = now + LOCKOUT_MS; rec.count = 0; } // lock, reset the counter
  _loginFails.set(key, rec);
  // Hard bound: if the map is over the cap (a flood of unique keys), sweep expired ones then evict the oldest
  // insertion-order entries down to the cap. Never relies on a successful login/restart to clean up (M2).
  if (_loginFails.size > LOCKOUT_MAX_ENTRIES) {
    sweepLockouts(now);
    let over = _loginFails.size - LOCKOUT_MAX_ENTRIES;
    if (over > 0) { for (const k of _loginFails.keys()) { if (over-- <= 0) break; _loginFails.delete(k); } }
  }
}
function noteLoginSuccess(key) { _loginFails.delete(key); }

async function login({ email, password } = {}, { ip } = {}) {
  if (!email || !password) throw AppError.validation('Email and password are required');
  // Reject an over-length email BEFORE building a lockout key or hashing — a 128 KiB email must not become a
  // 128 KiB map key or cost a bcrypt compare (audit M2).
  if (String(email).length > MAX_EMAIL_LEN) throw AppError.validation('Email is too long');
  const lower = String(email).toLowerCase();
  const key = lockoutKey(lower, ip);
  assertNotLockedOut(key); // refuse early while locked (before any password hashing work)

  // Try the owner account first, then a member. A single generic failure for every path — no enumeration
  // of which emails exist or whether a password was close.
  const account = await Account.findOne({ email: lower });
  if (account && await account.verifyPassword(password)) {
    noteLoginSuccess(key);
    const shopId = account._id.toString();
    const { accessToken, refreshToken } = tokensFor({ shopId, role: 'owner', memberId: shopId, name: 'Owner', tv: account.tokenVersion || 0 });
    return { token: accessToken, refreshToken, shop: shapeShop(account), role: 'owner', member: ownerAsMember(account) };
  }

  const member = await Member.findOne({ email: lower });
  if (member && member.active !== false && await member.verifyPassword(password)) {
    const owner = await Account.findById(member.account);
    if (owner) {
      noteLoginSuccess(key);
      const shopId = owner._id.toString();
      const { accessToken, refreshToken } = tokensFor({ shopId, role: member.role, memberId: member._id.toString(), name: member.name, tv: member.tokenVersion || 0 });
      return { token: accessToken, refreshToken, shop: shapeShop(owner), role: member.role, member: shapeMember(member) };
    }
  }

  noteLoginFailure(key);
  throw AppError.authInvalidCredentials('Email or password not recognised');
}

async function refresh(refreshToken) {
  if (!refreshToken) throw AppError.authRefreshInvalid();
  let decoded;
  try { decoded = jwt.verify(refreshToken, config.jwt.refreshSecret); }
  catch { throw AppError.authRefreshInvalid(); }
  if (decoded.typ !== 'pwa-refresh') throw AppError.authRefreshInvalid();

  // Owner (or a pre-staff token with no member id): re-issue with the owner role, but first re-check the
  // account's tokenVersion so a refresh token minted before a password change/reset is rejected.
  const isOwner = decoded.role === 'owner' || !decoded.mid || decoded.mid === decoded.shopId;
  if (isOwner) {
    const account = await Account.findById(decoded.shopId).select('tokenVersion').lean();
    if (!account) throw AppError.authRefreshInvalid();
    if ((decoded.tv || 0) !== (account.tokenVersion || 0)) throw AppError.authRefreshInvalid();
    const token = jwt.sign(
      { sub: decoded.sub, shopId: decoded.shopId, role: 'owner', mid: decoded.shopId, name: 'Owner', tv: account.tokenVersion || 0, typ: 'pwa' },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn },
    );
    return { token, role: 'owner' };
  }

  // Member: re-validate against the DB so a deactivated member can't refresh back in, and a role change
  // the owner made takes effect on the next refresh.
  const member = await Member.findById(decoded.mid);
  if (!member || member.active === false || member.account.toString() !== decoded.shopId) throw AppError.authRefreshInvalid();
  // S6: a refresh token minted before a password reset carries an older tv — reject it.
  if ((decoded.tv || 0) !== (member.tokenVersion || 0)) throw AppError.authRefreshInvalid();
  const token = jwt.sign(
    { sub: decoded.shopId, shopId: decoded.shopId, role: member.role, mid: member._id.toString(), name: member.name, tv: member.tokenVersion || 0, typ: 'pwa' },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
  return { token, role: member.role };
}

async function me(decoded) {
  const account = await Account.findById(decoded.shopId);
  if (!account) throw new AppError('Account not found', 404, 'NOT_FOUND');
  if (decoded.role && decoded.role !== 'owner') {
    const member = await Member.findById(decoded.mid);
    if (!member || member.active === false) throw new AppError('Invalid token', 401, 'AUTH_TOKEN_EXPIRED');
    return { shop: shapeShop(account), role: member.role, member: shapeMember(member) };
  }
  return { shop: shapeShop(account), role: 'owner', member: ownerAsMember(account) };
}

/** Verify a PWA access token (Bearer). Returns the decoded payload or throws. */
function verifyAccess(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) throw new AppError('No token provided', 401, 'AUTH_TOKEN_EXPIRED');
  let decoded;
  try { decoded = jwt.verify(authHeader.slice(7), config.jwt.secret); }
  catch { throw new AppError('Invalid token', 401, 'AUTH_TOKEN_EXPIRED'); }
  if (decoded.typ !== 'pwa') throw new AppError('Invalid token', 401, 'AUTH_TOKEN_EXPIRED');
  // Back-compat: tokens issued before staff access carried no role — treat them as the owner.
  if (!decoded.role) decoded.role = 'owner';
  return decoded;
}

/** Throw unless the decoded token is the shop owner. */
function requireOwner(decoded) {
  if (!decoded || decoded.role !== 'owner') throw new AppError('Only the shop owner can do this', 403, 'FORBIDDEN');
}

// ── Prompt staff-access revocation on the data path ───────────────────────────────────────────────────
// Access tokens are stateless JWTs, so by themselves a deactivated/removed/role-changed member would keep
// working until their short-lived token expired. The data routes (sync, notify) call assertMemberActive()
// to re-check the member against the DB. A tiny TTL cache keeps this to roughly one lookup per member per
// 30s under load; owner/member admin writes invalidate the entry so a deactivation bites on the NEXT
// request, not up to a TTL later. Owner tokens have no separate member to revoke and skip the DB entirely.
const MEMBER_CACHE_TTL_MS = 30000;
const _memberCache = new Map(); // memberId -> { at, found, active, role, account }

function invalidateMember(memberId) { if (memberId) _memberCache.delete(String(memberId)); }
/** Test hook: clear the member-status cache. */
function __clearMemberCache() { _memberCache.clear(); }

function isOwnerToken(decoded) {
  return !decoded || decoded.role === 'owner' || !decoded.mid || decoded.mid === decoded.shopId;
}

/**
 * For a MEMBER access token, re-validate the member against the DB and reject if they've been deactivated,
 * removed, or moved to another account; adopt their LIVE role so a role change takes effect immediately on
 * the data path too. No-op for owner tokens. Returns the (possibly role-updated) decoded payload.
 */
async function assertMemberActive(decoded) {
  if (isOwnerToken(decoded)) return decoded;
  const id = String(decoded.mid);
  const now = Date.now();
  let cached = _memberCache.get(id);
  if (!cached || now - cached.at > MEMBER_CACHE_TTL_MS) {
    const m = await Member.findById(id).select('active role account tokenVersion').lean();
    cached = {
      at: now,
      found: !!m,
      active: m ? m.active !== false : false,
      role: m ? m.role : null,
      account: m && m.account ? m.account.toString() : null,
      tokenVersion: m ? (m.tokenVersion || 0) : 0,
    };
    _memberCache.set(id, cached);
  }
  if (!cached.found || !cached.active || cached.account !== decoded.shopId) {
    throw new AppError('Access has been revoked', 401, 'AUTH_TOKEN_EXPIRED');
  }
  // S6: a token minted before a password reset carries an older tv — reject it (cache TTL ≤30s bounds the lag).
  if ((decoded.tv || 0) !== cached.tokenVersion) {
    throw new AppError('Access has been revoked', 401, 'AUTH_TOKEN_EXPIRED');
  }
  decoded.role = cached.role; // live role wins over whatever the token was minted with
  return decoded;
}

// ── Staff administration (owner only; the route enforces requireOwner) ───────────────────────────────
async function listMembers(accountId) {
  const members = await Member.find({ account: accountId }).sort({ createdAt: 1 });
  return { members: members.map(shapeMember) };
}

async function addMember(accountId, { email, name, role, password } = {}) {
  if (!email || !EMAIL_RE.test(String(email))) throw AppError.validation('A valid email is required');
  if (!name || !String(name).trim()) throw AppError.validation('A name is required');
  if (!password || String(password).length < MIN_PASSWORD) {
    throw AppError.validation(`Password must be at least ${MIN_PASSWORD} characters`);
  }
  const wantRole = Member.ROLES.includes(role) ? role : 'staff';
  const lower = String(email).toLowerCase();
  if (await emailInUse(lower)) throw new AppError('That email is already in use', 409, 'ACCOUNT_EXISTS');

  const passwordHash = await Member.hashPassword(password);
  const member = await Member.create({ account: accountId, email: lower, name: String(name).trim(), role: wantRole, passwordHash });
  return { member: shapeMember(member) };
}

async function updateMember(accountId, memberId, { name, role, active, password } = {}) {
  const member = await Member.findOne({ _id: memberId, account: accountId });
  if (!member) throw new AppError('Staff member not found', 404, 'NOT_FOUND');
  if (name != null && String(name).trim()) member.name = String(name).trim();
  if (role != null) {
    if (!Member.ROLES.includes(role)) throw AppError.validation('Unknown role');
    member.role = role;
  }
  if (active != null) member.active = !!active;
  if (password != null) {
    if (String(password).length < MIN_PASSWORD) throw AppError.validation(`Password must be at least ${MIN_PASSWORD} characters`);
    member.passwordHash = await Member.hashPassword(password);
    member.tokenVersion = (member.tokenVersion || 0) + 1; // S6: revoke every token issued before this reset
  }
  await member.save();
  invalidateMember(memberId); // deactivation / role change / reset bites on the next data request
  return { member: shapeMember(member) };
}

async function removeMember(accountId, memberId) {
  const res = await Member.deleteOne({ _id: memberId, account: accountId });
  if (!res.deletedCount) throw new AppError('Staff member not found', 404, 'NOT_FOUND');
  invalidateMember(memberId);
  return { removed: true };
}

module.exports = {
  register, login, refresh, me, verifyAccess, requireOwner, assertMemberActive,
  requestPasswordReset, resetPassword, changePassword, changeEmail,
  listMembers, addMember, updateMember, removeMember,
  __clearMemberCache, __clearLoginLockout, sweepLockouts, __lockoutSize: () => _loginFails.size,
};
