'use strict';

const cron = require('node-cron');
const { dailyReset }       = require('./dailyReset');
const { scheduledReports } = require('./scheduledReports');
const { expiryCheck }      = require('./expiryCheck');
const { expireParked }     = require('./expireParked');
const { priceSync }        = require('./priceSync');
const logger = require('../utils/logger');

module.exports = (io) => {
  logger.info('Starting cron jobs...');

  // Midnight UK — reset staff daily counters
  cron.schedule('0 0 * * *', dailyReset, { timezone: 'Europe/London' });

  // Every 5 mins — send any due scheduled reports
  cron.schedule('*/5 * * * *', scheduledReports);

  // 6am daily — check expiring products, auto-update statuses, emit alerts
  cron.schedule('0 6 * * *', () => expiryCheck(io), { timezone: 'Europe/London' });

  // Every hour — expire parked transactions > 4 hours old
  cron.schedule('0 * * * *', expireParked);

  // 3am daily — sync supplier prices if APIs configured
  cron.schedule('0 3 * * *', priceSync, { timezone: 'Europe/London' });

  logger.info('Cron jobs scheduled');
};
