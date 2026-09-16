'use strict';

const logger = require('../utils/logger');

let twilioClient = null;

function getClient() {
  if (twilioClient) return twilioClient;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    logger.warn('SMS: Twilio credentials not set — SMS disabled');
    return null;
  }
  try {
    twilioClient = require('twilio')(sid, token);
    return twilioClient;
  } catch (err) {
    logger.warn('SMS: Twilio package not available —', err.message);
    return null;
  }
}

const FROM = process.env.TWILIO_PHONE_NUMBER || '+441234567890';

/**
 * Send an SMS message.
 * @param {string} to   - E.164 phone number e.g. +447911123456
 * @param {string} body - Message text
 */
async function sendSMS(to, body) {
  const client = getClient();
  if (!client) {
    logger.info(`SMS (disabled) → ${to}: ${body}`);
    return { queued: false, reason: 'twilio_disabled' };
  }
  try {
    const msg = await client.messages.create({ from: FROM, to, body });
    logger.info(`SMS sent to ${to}: sid=${msg.sid}`);
    return { queued: true, sid: msg.sid };
  } catch (err) {
    logger.error(`SMS failed to ${to}:`, err.message);
    throw err;
  }
}

/**
 * Send a panic alert to all configured emergency numbers.
 * @param {object} opts - { storeName, tillId, staffName, location }
 */
async function sendPanicAlert({ storeName, tillId, staffName, location }) {
  const numbers = (process.env.PANIC_SMS_NUMBERS || '').split(',').map(n => n.trim()).filter(Boolean);
  if (numbers.length === 0) {
    logger.warn('SMS: No PANIC_SMS_NUMBERS configured');
    return [];
  }
  const body = `🚨 PANIC ALERT — ${storeName || 'Store'}\nStaff: ${staffName}\nTill: ${tillId}\nLocation: ${location || 'N/A'}\nTime: ${new Date().toLocaleTimeString('en-GB')}`;
  const results = await Promise.allSettled(numbers.map(n => sendSMS(n, body)));
  return results;
}

/**
 * Send a digital SMS receipt to a customer.
 * @param {object} opts - { to, storeName, receiptNumber, total, items }
 */
async function sendReceiptSMS({ to, storeName, receiptNumber, total, items = [] }) {
  if (!to) throw new Error('Phone number required');
  const itemLines = items.slice(0, 5).map(i => `  ${i.name} x${i.quantity} £${Number(i.lineTotal).toFixed(2)}`).join('\n');
  const more = items.length > 5 ? `\n  ...and ${items.length - 5} more` : '';
  const body = `${storeName || 'Vendora POS'} Receipt #${receiptNumber}\n${itemLines}${more}\nTotal: £${Number(total).toFixed(2)}\nThank you!`;
  return sendSMS(to, body);
}

module.exports = { sendSMS, sendPanicAlert, sendReceiptSMS };
