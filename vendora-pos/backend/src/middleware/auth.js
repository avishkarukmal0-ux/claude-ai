const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('../utils/AppError');
const Staff = require('../models/Staff');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('No token provided', 401, 'AUTH_TOKEN_EXPIRED'));
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') return next(AppError.authTokenExpired());
      return next(new AppError('Invalid token', 401, 'AUTH_TOKEN_EXPIRED'));
    }

    const staff = await Staff.findById(decoded.staffId).select('-pin -password -duressPin -twoFactorSecret');
    if (!staff) return next(AppError.authInvalidCredentials('User not found'));
    if (staff.status !== 'active') return next(AppError.forbidden('Account suspended or terminated'));

    req.user = staff;
    req.storeId = decoded.storeId || staff.store.toString();
    req.tillId = decoded.tillId || 'TILL-1';
    next();
  } catch (err) {
    next(err);
  }
};

const optionalAuthenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  return authenticate(req, res, next);
};

module.exports = { authenticate, optionalAuthenticate };
