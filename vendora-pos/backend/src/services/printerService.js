'use strict';
const logger = require('../utils/logger');
const getStatus = () => ({ connected: false, type: 'none', message: 'No printer configured' });
const testPrint = async () => { logger.info('[Printer] Test print'); return { success: true }; };
const printReceipt = async (sale) => { logger.info(`[Printer] Print receipt ${sale.receiptNumber}`); return { success: true }; };
module.exports = { getStatus, testPrint, printReceipt };
