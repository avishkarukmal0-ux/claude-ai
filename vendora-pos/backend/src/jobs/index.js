'use strict';

const cron = require('node-cron');
const { dailyReset }       = require('./dailyReset');
const { scheduledReports } = require('./scheduledReports');
const { expiryCheck }      = require('./expiryCheck');
const { expireParked }     = require('./expireParked');
const { priceSync }        = require('./priceSync');
const { trendUpdateJob }   = require('./trendUpdateJob');
const { dailySummary }     = require('./dailySummary');
const config = require('../config');
const logger = require('../utils/logger');

// Wrap any cron callback so unhandled rejections or synchronous throws are caught locally
function safe(name, fn) {
  return async () => {
    try {
      await fn();
    } catch (err) {
      logger.error(`Cron job [${name}] failed:`, err.message);
      if (err.stack) logger.error(`Stack:`, err.stack);
    }
  };
}

module.exports = (io) => {
  logger.info('Starting cron jobs...');

  // Midnight UK — reset staff daily counters
  cron.schedule('0 0 * * *', safe('dailyReset', dailyReset), { timezone: 'Europe/London' });

  // Every 5 mins — send any due scheduled reports
  cron.schedule('*/5 * * * *', safe('scheduledReports', scheduledReports));

  // 6am daily — check expiring products, auto-update statuses, emit alerts
  cron.schedule('0 6 * * *', safe('expiryCheck', () => expiryCheck(io)), { timezone: 'Europe/London' });

  // Every hour — expire parked transactions > 4 hours old
  cron.schedule('0 * * * *', safe('expireParked', expireParked));

  // 3am daily — sync supplier prices if APIs configured
  cron.schedule('0 3 * * *', safe('priceSync', priceSync), { timezone: 'Europe/London' });

  // 3:30am daily — refresh market trends + AI insights
  cron.schedule('30 3 * * *', safe('trendUpdateJob', () => trendUpdateJob(io)), { timezone: 'Europe/London' });

  // Every minute — fire each store's nightly owner summary at its close time
  // (per-store timezone handled inside the job; dedupe makes it once/day)
  cron.schedule('* * * * *', safe('dailySummary', dailySummary));

  // Every 15 min — send due PWA owner/staff daily digests. OPT-IN (NOTIFY_CRON=true): only reliable while
  // the instance stays awake. On a dyno that can sleep, drive POST /api/pwa-notify/run from an external
  // scheduler instead. Each account's once-per-day guard + send window keep this idempotent.
  if (config.notify && config.notify.cronEnabled) {
    const { runDue } = require('../services/pwaNotifyService');
    cron.schedule('*/15 * * * *', safe('pwaNotifyDigest', () => runDue(Date.now())));
    logger.info('PWA notify digest cron enabled (every 15 min)');
  }

  logger.info('Cron jobs scheduled');
};
