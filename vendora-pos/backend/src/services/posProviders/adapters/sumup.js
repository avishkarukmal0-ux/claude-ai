'use strict';

// sumup POS adapter. Live cloud operations are DISABLED (see adapterBase) until access + credentials +
// sandbox verification exist — this never fakes a connection or invents an endpoint.
//
// When enabling: SumUp Transactions/Receipts are PAYMENT-level only (no documented line items). normalizeSale stays disabled for stock — a payment amount must never deduct stock. CSV item-export is the only item-level route.
const { createAdapter } = require('../adapterBase');

module.exports = createAdapter('sumup');
