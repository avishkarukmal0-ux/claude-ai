'use strict';
const logger = require('../utils/logger');
const getStatus = () => ({ connected: false, provider: 'none', message: 'No terminal configured' });
const pair = async (provider, apiKey) => { logger.info(`[Card] Pair with ${provider}`); return { success: true }; };
module.exports = { getStatus, pair };
