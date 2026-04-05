const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const Staff = require('../models/Staff');
const Store = require('../models/Store');
const AppError = require('../utils/AppError');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { getRedis } = require('../config/redis');

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { employeeId, email, pin, password, storeId } = req.body;

    if (!storeId) return next(AppError.validation('storeId is required'));
    if (!employeeId && !email) return next(AppError.validation('employeeId or email required'));
    if (!pin && !password) return next(AppError.validation('pin or password required'));

    const store = await Store.findById(storeId);
    if (!store || !store.isActive) return next(AppError.authInvalidCredentials('Store not found'));

    const query = { store: storeId };
    if (email) query.email = email.toLowerCase();
    else query.employeeId = employeeId;

    const staff = await Staff.findOne(query);
    if (!staff || staff.status !== 'active') {
      return next(AppError.authInvalidCredentials());
    }

    let authenticated = false;
    let isDuress = false;

    if (pin && staff.pin) {
      authenticated = await bcrypt.compare(pin, staff.pin);
      if (!authenticated && staff.duressPin) {
        isDuress = await bcrypt.compare(pin, staff.duressPin);
        if (isDuress) authenticated = true;
      }
    } else if (password && staff.password) {
      authenticated = await bcrypt.compare(password, staff.password);
    }

    if (!authenticated) return next(AppError.authInvalidCredentials());

    if (isDuress) {
      // Emit panic alert silently
      if (req.io) {
        req.io.to(`store:${storeId}`).emit('lp:panic', {
          staffName: staff.displayName,
          tillId: req.body.tillId || 'TILL-1',
          timestamp: new Date(),
          type: 'duress_pin',
        });
      }
    }

    if (staff.twoFactorEnabled) {
      // Return partial token requiring 2FA
      const partial = jwt.sign(
        { staffId: staff._id, storeId, require2fa: true },
        config.jwt.secret,
        { expiresIn: '5m' }
      );
      return res.json({ success: true, require2fa: true, partialToken: partial });
    }

    const accessToken = jwt.sign(
      { staffId: staff._id, storeId, role: staff.role, employeeId: staff.employeeId },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const refreshToken = jwt.sign(
      { staffId: staff._id, storeId, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    // Store refresh token in Redis
    const redis = getRedis();
    await redis.set(`refresh:${refreshToken}`, staff._id.toString(), 'EX', 7 * 24 * 60 * 60);

    // Update lastLogin
    staff.lastLogin = new Date();
    await staff.save();

    const staffData = staff.toObject();
    delete staffData.pin;
    delete staffData.password;
    delete staffData.duressPin;
    delete staffData.twoFactorSecret;

    res.json({
      success: true,
      accessToken,
      refreshToken,
      staff: staffData,
      isDuress,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const redis = getRedis();
      await redis.del(`refresh:${refreshToken}`);
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return next(AppError.authRefreshInvalid());

    const redis = getRedis();
    const storedStaffId = await redis.get(`refresh:${refreshToken}`);
    if (!storedStaffId) return next(AppError.authRefreshInvalid());

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    } catch {
      await redis.del(`refresh:${refreshToken}`);
      return next(AppError.authRefreshInvalid());
    }

    const staff = await Staff.findById(decoded.staffId);
    if (!staff || staff.status !== 'active') return next(AppError.authRefreshInvalid());

    const accessToken = jwt.sign(
      { staffId: staff._id, storeId: decoded.storeId, role: staff.role, employeeId: staff.employeeId },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({ success: true, accessToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify-2fa
router.post('/verify-2fa', async (req, res, next) => {
  try {
    const { partialToken, totp } = req.body;
    if (!partialToken || !totp) return next(AppError.validation('partialToken and totp required'));

    let decoded;
    try {
      decoded = jwt.verify(partialToken, config.jwt.secret);
    } catch {
      return next(AppError.authTokenExpired());
    }

    if (!decoded.require2fa) return next(AppError.validation('Not a 2FA token'));

    const staff = await Staff.findById(decoded.staffId);
    if (!staff) return next(AppError.authInvalidCredentials());

    const speakeasy = require('speakeasy');
    const valid = speakeasy.totp.verify({
      secret: staff.twoFactorSecret,
      encoding: 'base32',
      token: totp,
      window: 1,
    });

    if (!valid) return next(new AppError('Invalid 2FA code', 401, 'AUTH_2FA_REQUIRED'));

    const accessToken = jwt.sign(
      { staffId: staff._id, storeId: decoded.storeId, role: staff.role, employeeId: staff.employeeId },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const refreshToken = jwt.sign(
      { staffId: staff._id, storeId: decoded.storeId, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    const redis = getRedis();
    await redis.set(`refresh:${refreshToken}`, staff._id.toString(), 'EX', 7 * 24 * 60 * 60);

    res.json({ success: true, accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify-pin
router.post('/verify-pin', authenticate, async (req, res, next) => {
  try {
    const { pin, action } = req.body;
    if (!pin) return next(AppError.validation('pin is required'));

    const storeId = req.storeId;
    const staff = await Staff.find({ store: storeId, status: 'active' });

    for (const member of staff) {
      if (!member.pin) continue;
      const match = await bcrypt.compare(pin, member.pin);
      if (match) {
        let isDuress = false;
        if (member.duressPin) {
          isDuress = await bcrypt.compare(pin, member.duressPin);
        }
        if (isDuress && req.io) {
          req.io.to(`store:${storeId}`).emit('lp:panic', {
            staffName: member.displayName,
            type: 'duress_pin',
            timestamp: new Date(),
          });
          return res.json({
            success: true,
            staffId: member._id,
            staffName: member.displayName,
            role: member.role,
            permissions: member.permissions,
          });
        }
        return res.json({
          success: true,
          staffId: member._id,
          staffName: member.displayName,
          role: member.role,
          permissions: member.permissions,
        });
      }
    }

    return next(AppError.pinVerificationFailed());
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const staff = await Staff.findById(req.user._id).select('-pin -password -duressPin -twoFactorSecret');
    if (!staff) return next(AppError.notFound('Staff'));
    res.json({ success: true, staff });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
