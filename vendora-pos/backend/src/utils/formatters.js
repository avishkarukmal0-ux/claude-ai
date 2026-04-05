const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const UK_TZ = 'Europe/London';

/**
 * Format a number as GBP currency string
 */
const formatCurrency = (amount) => {
  if (typeof amount !== 'number' || isNaN(amount)) return '£0.00';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Generate a receipt number in format YYYYMMDD-XXXX
 */
const generateReceiptNumber = (sequenceNum) => {
  const datePart = dayjs().tz(UK_TZ).format('YYYYMMDD');
  const seqPart = String(sequenceNum).padStart(4, '0');
  return `${datePart}-${seqPart}`;
};

/**
 * Format date for UK display
 */
const formatDate = (date, fmt = 'DD/MM/YYYY HH:mm') => {
  return dayjs(date).tz(UK_TZ).format(fmt);
};

/**
 * Calculate VAT from a VAT-inclusive price
 */
const extractVat = (priceIncVat, vatRate) => {
  const rates = { standard: 0.2, reduced: 0.05, zero: 0 };
  const rate = rates[vatRate] || 0;
  if (rate === 0) return { net: priceIncVat, vat: 0 };
  const net = priceIncVat / (1 + rate);
  const vat = priceIncVat - net;
  return { net: Math.round(net * 100) / 100, vat: Math.round(vat * 100) / 100 };
};

/**
 * Calculate VAT to add to a net price
 */
const addVat = (netPrice, vatRate) => {
  const rates = { standard: 0.2, reduced: 0.05, zero: 0 };
  const rate = rates[vatRate] || 0;
  const vat = netPrice * rate;
  return { gross: Math.round((netPrice + vat) * 100) / 100, vat: Math.round(vat * 100) / 100 };
};

/**
 * Round to 2 decimal places
 */
const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

/**
 * Format a phone number for display (UK style)
 */
const formatPhone = (phone) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('44') && cleaned.length === 12) {
    return `+44 ${cleaned.slice(2, 6)} ${cleaned.slice(6)}`;
  }
  if (cleaned.startsWith('07') && cleaned.length === 11) {
    return `${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
};

/**
 * Truncate string with ellipsis
 */
const truncate = (str, maxLen = 30) => {
  if (!str) return '';
  return str.length > maxLen ? `${str.slice(0, maxLen - 3)}...` : str;
};

module.exports = {
  formatCurrency,
  generateReceiptNumber,
  formatDate,
  extractVat,
  addVat,
  round2,
  formatPhone,
  truncate,
  UK_TZ,
};
