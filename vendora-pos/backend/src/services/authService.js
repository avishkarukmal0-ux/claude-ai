'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/index');
const { getRedis } = require('../config/redis');
const Staff = require('../models/Staff');
const AppError = require('../utils/AppError');

/**
 * Parse a JWT expiry string like "15m", "7d" into seconds
 */
function expiryToSeconds(exp) {
  if (typeof exp === 'number') return exp;
  const match = String(exp).match(/^(\d+)([smhd])$/);
  if (!match) return 900;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return n * (multipliers[unit] || 60);
}

/**
 * Generate a JWT access token + refresh token pair for a staff member.
 */
async function generateTokens(staff) {
  const payload = {
    staffId: staff._id.toString(),
    storeId: staff.store.toString(),
    role: staff.role,
    employeeId: staff.employeeId,
  };

  const accessToken = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

  const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });

  return { accessToken, refreshToken };
}

/**
 * Login using storeId + employeeId/email + pin/password.
 * Returns { accessToken, refreshToken, staff } or { isDuress: true } silently.
 */
async function login(storeId, identifier, credential) {
  const query = {
    store: storeId,
    status: 'active',
    $or: [{ employeeId: identifier }, { email: identifier }],
  };

  const staff = await Staff.findOne(query).select('+pin +duressPin +password');
  if (!staff) throw AppError.authInvalidCredentials();

  // Try PIN comparison first, then password fallback
  let pinMatch = false;
  let passwordMatch = false;
  let isDuressPinMatch = false;

  if (credential) {
    pinMatch = await bcrypt.compare(String(credential), staff.pin);
    if (!pinMatch && staff.password) {
      passwordMatch = await bcrypt.compare(String(credential), staff.password);
    }
    if (!pinMatch && !passwordMatch && staff.duressPin) {
      isDuressPinMatch = await bcrypt.compare(String(credential), staff.duressPin);
    }
  }

  if (!pinMatch && !passwordMatch && !isDuressPinMatch) {
    throw AppError.authInvalidCredentials();
  }

  // Duress PIN: return silently with flag (caller handles alerting)
  if (isDuressPinMatch) {
    return { isDuress: true };
  }

  // Update lastLogin
  staff.lastLogin = new Date();
  await staff.save();

  const tokens = await generateTokens(staff);

  const safeStaff = await Staff.findById(staff._id).select('-pin -duressPin -password -twoFactorSecret');

  return { ...tokens, staff: safeStaff };
}

/**
 * Verify a refresh token and return a new token pair.
 */
async function refreshTokens(refreshToken) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
  } catch {
    throw AppError.authRefreshInvalid();
  }

  // Check blacklist
  const redis = getRedis();
  const blacklisted = await redis.get(`blacklist:refresh:${refreshToken}`);
  if (blacklisted) throw AppError.authRefreshInvalid();

  const staff = await Staff.findById(decoded.staffId).select('-pin -duressPin -password -twoFactorSecret');
  if (!staff || staff.status !== 'active') throw AppError.authRefreshInvalid();

  // Rotate: blacklist old token
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) {
    await redis.set(`blacklist:refresh:${refreshToken}`, '1', 'EX', ttl);
  }

  const tokens = await generateTokens(staff);
  return { ...tokens, staff };
}

/**
 * Find an active staff member whose PIN matches the provided pin.
 * Returns staff info. Returns { isDuress: true } if duress PIN matches.
 * Optionally checks that the staff role meets requiredRole.
 */
async function verifyPin(storeId, pin, requiredRole = null) {
  const roleHierarchy = ['cashier', 'supervisor', 'manager', 'owner'];

  const candidates = await Staff.find({ store: storeId, status: 'active' }).select('+pin +duressPin');

  for (const candidate of candidates) {
    const pinMatch = await bcrypt.compare(String(pin), candidate.pin);
    if (pinMatch) {
      if (requiredRole) {
        const requiredIdx = roleHierarchy.indexOf(requiredRole);
        const staffIdx = roleHierarchy.indexOf(candidate.role);
        if (staffIdx < requiredIdx) {
          throw AppError.permissionDenied('Insufficient role for this action');
        }
      }
      const safeStaff = await Staff.findById(candidate._id).select('-pin -duressPin -password -twoFactorSecret');
      return { staff: safeStaff };
    }

    if (candidate.duressPin) {
      const duressMatch = await bcrypt.compare(String(pin), candidate.duressPin);
      if (duressMatch) {
        return { isDuress: true, staffId: candidate._id.toString() };
      }
    }
  }

  throw AppError.pinVerificationFailed();
}

/**
 * Blacklist a refresh token in Redis with TTL = remaining lifetime.
 */
async function logout(refreshToken) {
  if (!refreshToken) return;

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, config.jwt.refreshSecret, { ignoreExpiration: false });
  } catch {
    // Already expired - no need to blacklist
    return;
  }

  const ttl = decoded.exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) {
    const redis = getRedis();
    await redis.set(`blacklist:refresh:${refreshToken}`, '1', 'EX', ttl);
  }
}

/**
 * Return staff profile without sensitive fields.
 */
async function getProfile(staffId) {
  const staff = await Staff.findById(staffId).select('-pin -duressPin -password -twoFactorSecret');
  if (!staff) throw AppError.notFound('Staff member');
  return staff;
}

module.exports = {
  login,
  generateTokens,
  refreshTokens,
  verifyPin,
  logout,
  getProfile,
};
