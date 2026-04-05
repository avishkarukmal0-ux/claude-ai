'use strict';
const logger = require('../utils/logger');
const send = async ({ to, subject, html, text }) => {
  if (process.env.NODE_ENV === 'development') { logger.info(`[Email] To:${to} Subject:${subject}`); return; }
  if (!process.env.SENDGRID_API_KEY) return;
  const nodemailer = require('nodemailer');
  const t = nodemailer.createTransport({ host:'smtp.sendgrid.net',port:587,auth:{user:'apikey',pass:process.env.SENDGRID_API_KEY} });
  await t.sendMail({ from: process.env.SENDGRID_FROM_EMAIL, to, subject, html, text });
};
module.exports = { send };
