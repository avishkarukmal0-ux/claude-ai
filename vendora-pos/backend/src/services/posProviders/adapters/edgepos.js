'use strict';

// edgepos POS adapter. Live cloud operations are DISABLED (see adapterBase) until access + credentials +
// sandbox verification exist — this never fakes a connection or invents an endpoint.
//
// When enabling: EDGEPoS (Henderson Technology). Partner-only API (powers Snappy Shopper/Nisa links). Integration agreement with Henderson required; endpoints/fields unconfirmed. Disabled; CSV export is the interim route.
const { createAdapter } = require('../adapterBase');

module.exports = createAdapter('edgepos');
