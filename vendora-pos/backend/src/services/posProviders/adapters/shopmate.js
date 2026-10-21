'use strict';

// shopmate POS adapter. Live cloud operations are DISABLED (see adapterBase) until access + credentials +
// sandbox verification exist — this never fakes a connection or invents an endpoint.
//
// When enabling: ShopMate (Retail Data Partnership). No public API — data-sharing agreement required; RDP pushes sales/price/promo to approved partners. Disabled; CSV export is the interim route.
const { createAdapter } = require('../adapterBase');

module.exports = createAdapter('shopmate');
