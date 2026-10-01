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
const config = require('../config');
const AppError = require('../utils/AppError');
const Account = require('../models/Account');
const Member = require('../models/Member');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// Identity carried in every token. For the owner, mid === shopId.
function tokensFor({ shopId, role, memberId, name }) {
  const base = { sub: shopId, shopId, role, mid: memberId, name };
  const accessToken = jwt.sign({ ...base, typ: 'pwa' }, config.jwt.secret, { expiresIn: config.jwt.expiresIn });
  const refreshToken = jwt.sign(
    { sub: shopId, shopId, role, mid: memberId, typ: 'pwa-refresh' },
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
  const { accessToken, refreshToken } = tokensFor({ shopId: account._id.toString(), role: 'owner', memberId: account._id.toString(), name: 'Owner' });
  return { token: accessToken, refreshToken, shop: shapeShop(account), role: 'owner', member: ownerAsMember(account) };
}

async function login({ email, password } = {}) {
  if (!email || !password) throw AppError.validation('Email and password are required');
  const lower = String(email).toLowerCase();

  // Try the owner account first, then a member. A single generic failure for every path — no enumeration
  // of which emails exist or whether a password was close.
  const account = await Account.findOne({ email: lower });
  if (account && await account.verifyPassword(password)) {
    const shopId = account._id.toString();
    const { accessToken, refreshToken } = tokensFor({ shopId, role: 'owner', memberId: shopId, name: 'Owner' });
    return { token: accessToken, refreshToken, shop: shapeShop(account), role: 'owner', member: ownerAsMember(account) };
  }

  const member = await Member.findOne({ email: lower });
  if (member && member.active !== false && await member.verifyPassword(password)) {
    const owner = await Account.findById(member.account);
    if (owner) {
      const shopId = owner._id.toString();
      const { accessToken, refreshToken } = tokensFor({ shopId, role: member.role, memberId: member._id.toString(), name: member.name });
      return { token: accessToken, refreshToken, shop: shapeShop(owner), role: member.role, member: shapeMember(member) };
    }
  }

  throw AppError.authInvalidCredentials('Email or password not recognised');
}

async function refresh(refreshToken) {
  if (!refreshToken) throw AppError.authRefreshInvalid();
  let decoded;
  try { decoded = jwt.verify(refreshToken, config.jwt.refreshSecret); }
  catch { throw AppError.authRefreshInvalid(); }
  if (decoded.typ !== 'pwa-refresh') throw AppError.authRefreshInvalid();

  // Owner (or a pre-staff token with no member id): re-issue with the owner role.
  const isOwner = decoded.role === 'owner' || !decoded.mid || decoded.mid === decoded.shopId;
  if (isOwner) {
    const token = jwt.sign(
      { sub: decoded.sub, shopId: decoded.shopId, role: 'owner', mid: decoded.shopId, name: 'Owner', typ: 'pwa' },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn },
    );
    return { token, role: 'owner' };
  }

  // Member: re-validate against the DB so a deactivated member can't refresh back in, and a role change
  // the owner made takes effect on the next refresh.
  const member = await Member.findById(decoded.mid);
  if (!member || member.active === false || member.account.toString() !== decoded.shopId) throw AppError.authRefreshInvalid();
  const token = jwt.sign(
    { sub: decoded.shopId, shopId: decoded.shopId, role: member.role, mid: member._id.toString(), name: member.name, typ: 'pwa' },
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
    const m = await Member.findById(id).select('active role account').lean();
    cached = {
      at: now,
      found: !!m,
      active: m ? m.active !== false : false,
      role: m ? m.role : null,
      account: m && m.account ? m.account.toString() : null,
    };
    _memberCache.set(id, cached);
  }
  if (!cached.found || !cached.active || cached.account !== decoded.shopId) {
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
  listMembers, addMember, updateMember, removeMember,
  __clearMemberCache,
};
