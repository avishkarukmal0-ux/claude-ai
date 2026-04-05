'use strict';
const initiate = async (amount, reference) => ({ success: false, message: 'Open Banking not configured' });
const getStatus = async (paymentId) => ({ status: 'unknown' });
module.exports = { initiate, getStatus };
