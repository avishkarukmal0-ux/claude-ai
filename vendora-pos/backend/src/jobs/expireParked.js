'use strict';
const parkedService = require('../services/parkedTransactionsService');
const logger = require('../utils/logger');
const expireParked = async () => {
  try {
    const count = await parkedService.expireOld();
    if (count > 0) logger.info(`Expired ${count} parked transactions`);
  } catch (err) { logger.error('Expire parked error:', err.message); }
};
module.exports = { expireParked };
