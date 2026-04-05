'use strict';
const exportForXero = async (storeId, from, to) => ({ success: false, message: 'Xero integration not configured' });
const exportForQuickbooks = async (storeId, from, to) => ({ success: false, message: 'QuickBooks integration not configured' });
module.exports = { exportForXero, exportForQuickbooks };
