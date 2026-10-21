'use strict';

// zettle POS adapter. Live cloud operations are DISABLED (see adapterBase) until access + credentials +
// sandbox verification exist — this never fakes a connection or invents an endpoint.
//
// When enabling: Zettle Purchases API (OAuth2) + Pusher real-time. Real impl: use Purchases as the single sales source; do NOT also apply Inventory events (double-count). Multi-merchant app needs partner approval.
const { createAdapter } = require('../adapterBase');

module.exports = createAdapter('zettle');
