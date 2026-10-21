'use strict';

// lightspeed POS adapter. Live cloud operations are DISABLED (see adapterBase) until access + credentials +
// sandbox verification exist — this never fakes a connection or invents an endpoint.
//
// When enabling: Lightspeed Retail X-Series Sales API. Real impl: OAuth2 or personal token; poll closed sales / webhooks; flatten sale line items. Confirm access tier + fees first.
const { createAdapter } = require('../adapterBase');

module.exports = createAdapter('lightspeed');
