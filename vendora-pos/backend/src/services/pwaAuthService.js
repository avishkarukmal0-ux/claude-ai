'use strict';

// PWA owner-account auth service (infra Stage 2b). Reuses the app's hardened JWT config
// (config/validateSecrets refuses weak prod secrets). Tokens carry `typ: 'pwa'` so they can never be
// confused with the till's Staff tokens. Thin routes, fat service (project convention).
const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('../utils/AppError');
const Account = require('../models/Account');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function tokensFor(account) {
  const shopId = account._id.toString();
  const accessToken = jwt.sign(
    { sub: shopId, shopId, typ: 'pwa' },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
  const refreshToken = jwt.sign(
    { sub: shopId, shopId, typ: 'pwa-refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn },
  );
  return { accessToken, refreshToken };
}

function shapeShop(account) {
  return { id: account._id.toString(), name: account.shopName };
}

async function register({ email, password, shopName } = {}) {
  if (!email || !EMAIL_RE.test(String(email))) throw AppError.validation('A valid email is required');
  if (!password || String(password).length < MIN_PASSWORD) {
    throw AppError.validation(`Password must be at least ${MIN_PASSWORD} characters`);
  }
  if (!shopName || !String(shopName).trim()) throw AppError.validation('Shop name is required');

  const lower = String(email).toLowerCase();
  const existing = await Account.findOne({ email: lower });
  if (existing) throw new AppError('That email is already registered', 409, 'ACCOUNT_EXISTS');

  const passwordHash = await Account.hashPassword(password);
  const account = await Account.create({ email: lower, passwordHash, shopName: String(shopName).trim() });
  const { accessToken, refreshToken } = tokensFor(account);
  return { token: accessToken, refreshToken, shop: shapeShop(account) };
}

async function login({ email, password } = {}) {
  if (!email || !password) throw AppError.validation('Email and password are required');
  const account = await Account.findOne({ email: String(email).toLowerCase() });
  // Generic failure whether or not the email exists — no account enumeration.
  const ok = account ? await account.verifyPassword(password) : false;
  if (!account || !ok) throw AppError.authInvalidCredentials('Email or password not recognised');
  const { accessToken, refreshToken } = tokensFor(account);
  return { token: accessToken, refreshToken, shop: shapeShop(account) };
}

async function refresh(refreshToken) {
  if (!refreshToken) throw AppError.authRefreshInvalid();
  let decoded;
  try { decoded = jwt.verify(refreshToken, config.jwt.refreshSecret); }
  catch { throw AppError.authRefreshInvalid(); }
  if (decoded.typ !== 'pwa-refresh') throw AppError.authRefreshInvalid();
  const token = jwt.sign(
    { sub: decoded.sub, shopId: decoded.shopId, typ: 'pwa' },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn },
  );
  return { token };
}

async function me(accountId) {
  const account = await Account.findById(accountId);
  if (!account) throw new AppError('Account not found', 404, 'NOT_FOUND');
  return { shop: shapeShop(account) };
}

/** Verify a PWA access token (Bearer). Returns the decoded payload or throws. */
function verifyAccess(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) throw new AppError('No token provided', 401, 'AUTH_TOKEN_EXPIRED');
  let decoded;
  try { decoded = jwt.verify(authHeader.slice(7), config.jwt.secret); }
  catch { throw new AppError('Invalid token', 401, 'AUTH_TOKEN_EXPIRED'); }
  if (decoded.typ !== 'pwa') throw new AppError('Invalid token', 401, 'AUTH_TOKEN_EXPIRED');
  return decoded;
}

module.exports = { register, login, refresh, me, verifyAccess };
