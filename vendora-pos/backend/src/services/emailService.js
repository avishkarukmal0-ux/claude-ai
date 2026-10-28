'use strict';
const logger = require('../utils/logger');
const config = require('../config');

// Audit B5: use the CONFIGURED From address (NOTIFY_FROM_EMAIL || SENDGRID_FROM_EMAIL || default) rather than
// reading only SENDGRID_FROM_EMAIL — otherwise an install that set only NOTIFY_FROM_EMAIL reports "configured" but
// sends with no From address. An explicit `from` arg still wins.
function fromAddress(from) {
  // Audit B5 (round 2): the config key is `config.notify` (not `config.notifications` — a typo that made this
  // branch dead, so it only ever worked via the env fallbacks). config.notify.from already resolves
  // NOTIFY_FROM_EMAIL || SENDGRID_FROM_EMAIL || the default, so prefer it; keep the env fallbacks as a belt.
  return from
    || (config.notify && config.notify.from)
    || process.env.NOTIFY_FROM_EMAIL
    || process.env.SENDGRID_FROM_EMAIL
    || 'noreply@vendora.co.uk';
}
const send = async ({ to, subject, html, text, from }) => {
  if (process.env.NODE_ENV === 'development') { logger.info(`[Email] To:${to} Subject:${subject}`); return; }
  if (!process.env.SENDGRID_API_KEY) return;
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({ host:'smtp.sendgrid.net',port:587,auth:{user:'apikey',pass:process.env.SENDGRID_API_KEY} });
  await t.sendMail({ from: fromAddress(from), to, subject, html, text });
};
// Can this server actually deliver an email right now? (Used so the password-reset flow can honestly tell an
// owner whether a reset link will arrive, rather than claiming "check your email" when nothing can be sent.)
// In development, send() logs instead of delivering, so treat that as "configured" for the dev flow.
function isConfigured() {
  return !!process.env.SENDGRID_API_KEY || process.env.NODE_ENV === 'development';
}

module.exports = { send, fromAddress, isConfigured };
