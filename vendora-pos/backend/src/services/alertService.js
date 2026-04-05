'use strict';

const logger = require('../utils/logger');

/**
 * Send an alert via SMS or email (stubbed — integrates with Twilio/SendGrid when keys are configured)
 */
async function sendSmsAlert(phone, message) {
  if (!process.env.TWILIO_ACCOUNT_SID) {
    logger.info(`[SMS Alert] To ${phone}: ${message}`);
    return;
  }
  try {
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });
  } catch (err) {
    logger.error('SMS alert failed:', err.message);
  }
}

async function sendEmailAlert(to, subject, body) {
  if (!process.env.SENDGRID_API_KEY) {
    logger.info(`[Email Alert] To ${to}: ${subject}`);
    return;
  }
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
    });
    await transporter.sendMail({ from: process.env.SENDGRID_FROM_EMAIL, to, subject, text: body });
  } catch (err) {
    logger.error('Email alert failed:', err.message);
  }
}

module.exports = { sendSmsAlert, sendEmailAlert };
