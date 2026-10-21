'use strict';

// paypoint POS adapter. Live cloud operations are DISABLED (see adapterBase) until access + credentials +
// sandbox verification exist — this never fakes a connection or invents an endpoint.
//
// When enabling: PayPoint One / Mini + Connect. No public API — PayPoint partner accreditation required. Item-level availability unconfirmed. Disabled; CSV export is the interim route if the shop can produce item lines.
const { createAdapter } = require('../adapterBase');

module.exports = createAdapter('paypoint');
