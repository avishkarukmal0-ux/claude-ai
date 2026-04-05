'use strict';
const logger = require('../utils/logger');
const generateReference = (tillId) => `CCTV-${tillId}-${Date.now()}`;
const markEvent = async (reference, event) => { logger.info(`[CCTV] Event ${event} on ${reference}`); };
module.exports = { generateReference, markEvent };
