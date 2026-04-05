'use strict';
const logger = require('../utils/logger');
const getWeight = async () => { logger.info('[Scale] Get weight'); return { weight: 0, unit: 'kg', connected: false }; };
const tare = async () => { logger.info('[Scale] Tare'); return { success: true }; };
module.exports = { getWeight, tare };
