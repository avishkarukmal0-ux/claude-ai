const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * Generate a random alphanumeric ID of given length
 */
const randomId = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Generate a gift card code in format XXXX-XXXX-XXXX-XXXX
 */
const generateGiftCardCode = () => {
  const segment = () => randomId(4);
  return `${segment()}-${segment()}-${segment()}-${segment()}`;
};

/**
 * Generate a unique customer code
 */
const generateCustomerCode = () => {
  return `CUST-${randomId(6)}`;
};

/**
 * Generate a park ID
 */
const generateParkId = () => {
  return `PARK-${randomId(5)}-${randomId(3)}`;
};

/**
 * Generate a PO number
 */
const generatePONumber = () => {
  const date = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `PO-${datePart}-${randomId(4)}`;
};

/**
 * Sleep for ms milliseconds
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Safe JSON parse
 */
const safeJsonParse = (str, fallback = null) => {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
};

/**
 * Calculate percentage
 */
const pct = (value, total) => {
  if (!total) return 0;
  return Math.round((value / total) * 100 * 100) / 100;
};

/**
 * Get start of today in UTC
 */
const todayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Get end of today
 */
const todayEnd = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

/**
 * Paginate a mongoose query
 */
const paginate = (query, page = 1, limit = 50) => {
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  return query.skip(skip).limit(parseInt(limit, 10));
};

/**
 * Build a date range filter for mongoose
 */
const dateRangeFilter = (field, from, to) => {
  const filter = {};
  if (from || to) {
    filter[field] = {};
    if (from) filter[field].$gte = new Date(from);
    if (to) filter[field].$lte = new Date(to);
  }
  return filter;
};

module.exports = {
  randomId,
  generateGiftCardCode,
  generateCustomerCode,
  generateParkId,
  generatePONumber,
  sleep,
  safeJsonParse,
  pct,
  todayStart,
  todayEnd,
  paginate,
  dateRangeFilter,
};
