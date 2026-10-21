'use strict';

// eposnow POS adapter. Live cloud operations are DISABLED (see adapterBase) until access + credentials +
// sandbox verification exist — this never fakes a connection or invents an endpoint.
//
// When enabling: Epos Now Transactions API (HTTP Basic, per API Device). Real impl: poll transactions (webhooks beta); map item lines; reconcile. Shop creates an API Device in the Back Office.
const { createAdapter } = require('../adapterBase');

module.exports = createAdapter('eposnow');
