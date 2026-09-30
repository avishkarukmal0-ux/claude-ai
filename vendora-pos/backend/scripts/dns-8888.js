'use strict';

// Force Node's DNS resolver to public servers. Some networks (mobile hotspots, captive Wi-Fi) refuse
// the SRV lookups that `mongodb+srv://` needs, giving `querySrv ECONNREFUSED`. Preload this with
//   NODE_OPTIONS=--require ./scripts/dns-8888.js
// so `node scripts/check-db.js` and `npm run test:pwa-auth` can resolve Atlas. No effect otherwise.
try {
  require('dns').setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  /* ignore — leave the default resolver in place */
}
