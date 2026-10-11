'use strict';
const logger = require('../utils/logger');
const config = require('../config');

// Audit B5: use the CONFIGURED From address (NOTIFY_FROM_EMAIL || SENDGRID_FROM_EMAIL || default) rather than
// reading only SENDGRID_FROM_EMAIL — otherwise an install that set only NOTIFY_FROM_EMAIL reports "configured" but
// sends with no From address. An explicit `from` arg still wins.
function fromAddress(from) {
  return from
    || (config.notifications && config.notifications.from)
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
module.exports = { send, fromAddress };
