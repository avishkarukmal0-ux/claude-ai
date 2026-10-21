'use strict';

// square POS adapter. Live cloud operations are DISABLED (see adapterBase) until access + credentials +
// sandbox verification exist — this never fakes a connection or invents an endpoint.
//
// When enabling: Square Orders API. Real impl: OAuth app + order.created/order.updated webhooks (metadata) → RetrieveOrder for line_items; map return line items → LINE_KIND.RETURN; monetary refund.* events are NOT restocks.
const { createAdapter } = require('../adapterBase');

module.exports = createAdapter('square');
