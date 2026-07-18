'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION DELIVERY
// Sends owner-facing messages and records every attempt in the Notification
// outbox (idempotent via dedupeKey). WhatsApp goes through Twilio, which is
// LAZY-LOADED and gated on env vars — if Twilio isn't configured the message is
// recorded as `skipped` rather than crashing boot or the cron job. Drop the
// Twilio creds into the backend .env to switch it on:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (e.g. whatsapp:+14155238886)
// ─────────────────────────────────────────────────────────────────────────────

const Notification = require('../models/Notification');
const logger = require('../utils/logger');

function whatsappConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
}

let _client;
function twilioClient() {
  if (_client) return _client;
  const twilio = require('twilio'); // lazy — only required when actually sending
  _client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return _client;
}

const wa = (n) => (String(n).startsWith('whatsapp:') ? String(n) : `whatsapp:${n}`);

async function sendWhatsApp(to, body) {
  const msg = await twilioClient().messages.create({
    from: wa(process.env.TWILIO_WHATSAPP_FROM),
    to: wa(to),
    body,
  });
  return msg.sid;
}

// Idempotent deliver: creates the outbox row (keyed by dedupeKey), attempts the
// send, and records the outcome. Returns { sent | skipped | failed }.
async function deliver({ store, type, channel, recipient, text, dedupeKey }) {
  let record;
  try {
    record = await Notification.create({ store, type, channel, recipient, text, dedupeKey, status: 'pending' });
  } catch (err) {
    if (err.code === 11000) {
      logger.info(`Notification ${dedupeKey} already exists — skipping duplicate`);
      return { skipped: true, reason: 'duplicate' };
    }
    throw err;
  }

  try {
    if (channel !== 'whatsapp') throw new Error(`Unsupported channel: ${channel}`);

    if (!whatsappConfigured()) {
      record.status = 'skipped';
      record.error = 'WhatsApp/Twilio not configured (set TWILIO_* env vars)';
      await record.save();
      logger.warn(`WhatsApp not configured — recorded ${dedupeKey} as skipped`);
      return { skipped: true, reason: 'not_configured', record };
    }

    const sid = await sendWhatsApp(recipient, text);
    record.status = 'sent';
    record.providerId = sid;
    record.sentAt = new Date();
    await record.save();
    logger.info(`Notification ${dedupeKey} sent (${sid})`);
    return { sent: true, record };
  } catch (err) {
    record.status = 'failed';
    record.error = err.message;
    await record.save();
    logger.error(`Notification ${dedupeKey} failed: ${err.message}`);
    return { failed: true, error: err.message, record };
  }
}

module.exports = { deliver, sendWhatsApp, whatsappConfigured };
