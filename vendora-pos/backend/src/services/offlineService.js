'use strict';
const OfflineQueue = require('../models/OfflineQueue');
const logger = require('../utils/logger');
const queue = async (storeId, tillId, action, payload) => {
  return OfflineQueue.create({ store: storeId, tillId, action, payload, status: 'pending', createdOfflineAt: new Date() });
};
const sync = async (storeId) => {
  const pending = await OfflineQueue.find({ store: storeId, status: 'pending' }).limit(50);
  logger.info(`[Offline] ${pending.length} items to sync`);
  return pending;
};
module.exports = { queue, sync };
