const rateLimit = require('express-rate-limit');

// Under the test runner, lift the caps so integration suites (which fire many auth calls from one IP)
// aren't throttled. Real limits always apply outside NODE_ENV=test.
const isTest = process.env.NODE_ENV === 'test';

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 100000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many requests, please try again later.' },
  },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 100000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many login attempts, please wait a minute.' },
  },
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isTest ? 100000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Rate limit exceeded.' },
  },
});

module.exports = { generalLimiter, authLimiter, strictLimiter };
