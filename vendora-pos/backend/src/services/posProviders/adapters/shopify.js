'use strict';

// shopify POS adapter. Live cloud operations are DISABLED (see adapterBase) until access + credentials +
// sandbox verification exist — this never fakes a connection or invents an endpoint.
//
// When enabling: Shopify Admin Orders API. Real impl: app with read_orders + orders/create (and refunds/create) webhooks with HMAC verify; map line_items → sale lines, refund_line_items → returns.
const { createAdapter } = require('../adapterBase');

module.exports = createAdapter('shopify');
