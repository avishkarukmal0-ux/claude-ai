'use strict';
const Staff = require('../models/Staff');
const logger = require('../utils/logger');
const dailyReset = async () => {
  try {
    const result = await Staff.updateMany({}, {
      $set: {
        'dailyCounters.voids.count': 0,
        'dailyCounters.voids.amount': 0,
        'dailyCounters.voids.lastReset': new Date(),
        'dailyCounters.refunds.count': 0,
        'dailyCounters.refunds.amount': 0,
        'dailyCounters.refunds.lastReset': new Date(),
        'dailyCounters.discounts.count': 0,
        'dailyCounters.discounts.amount': 0,
        'dailyCounters.discounts.lastReset': new Date(),
      }
    });
    logger.info(`Daily reset: cleared counters for ${result.modifiedCount} staff`);
  } catch (err) {
    logger.error('Daily reset error:', err.message);
  }
};
module.exports = { dailyReset };
