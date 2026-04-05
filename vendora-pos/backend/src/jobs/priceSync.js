'use strict';
const logger = require('../utils/logger');
const priceSync = async () => {
  try {
    logger.info('Price sync: no supplier APIs configured, skipping');
  } catch (err) { logger.error('Price sync error:', err.message); }
};
module.exports = { priceSync };
