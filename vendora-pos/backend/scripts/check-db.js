'use strict';

// Opt-in DNS fix: some networks (mobile hotspots, captive Wi-Fi) refuse the SRV lookups that
// mongodb+srv needs (querySrv ECONNREFUSED). Set VENDORA_DNS_PUBLIC=1 to route Node's DNS via public
// resolvers. No path/NODE_OPTIONS needed. Harmless when the network is already fine.
if (process.env.VENDORA_DNS_PUBLIC === '1') {
  try { require('dns').setServers(['8.8.8.8', '1.1.1.1']); } catch { /* keep default resolver */ }
}

// Standalone MongoDB connectivity check — verifies the environment can actually reach and
// authenticate to a MongoDB before we rely on it (e.g. before PWA-auth Stage 2b).
//
// Usage:  node scripts/check-db.js
// Reads the connection string from VENDORA_TEST_URI (preferred) or MONGODB_URI. It NEVER prints the
// URI or credentials — only the host, database name, and whether the connection/ping succeeded.

const mongoose = require('mongoose');

function maskHost(uri) {
  // pull just the host(s) out of a mongodb / mongodb+srv URI, dropping any user:pass
  try {
    const m = uri.match(/^mongodb(\+srv)?:\/\/(?:[^@]*@)?([^/?]+)/i);
    return m ? m[2] : '(unparseable host)';
  } catch { return '(unparseable host)'; }
}

(async () => {
  const uri = process.env.VENDORA_TEST_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.log('NO_URI: set VENDORA_TEST_URI (or MONGODB_URI) in the environment first.');
    console.log('  - Add it in the cloud environment settings (title-bar menu → Edit → API credentials / env var).');
    console.log('  - Never paste the connection string into chat; a new session will pick it up.');
    process.exit(2);
  }
  console.log(`Trying MongoDB at host: ${maskHost(uri)} …`);
  const started = Date.now();
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    const admin = mongoose.connection.db.admin();
    await admin.ping();
    console.log(`OK: connected + ping succeeded in ${Date.now() - started}ms.`);
    console.log(`  database: ${mongoose.connection.name}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    let kind = 'UNKNOWN';
    if (/ENOTFOUND|EAI_AGAIN|querySrv|getaddrinfo/i.test(msg)) kind = 'DNS/NETWORK (host not resolvable from here)';
    else if (/ECONNREFUSED|ETIMEDOUT|timed out|serverSelection/i.test(msg)) kind = 'NETWORK (blocked or unreachable — likely the sandbox network policy or Atlas IP allowlist)';
    else if (/auth|password|Authentication|not authorized/i.test(msg)) kind = 'AUTH (reached the server, but credentials/permissions failed)';
    console.log(`FAIL [${kind}]: ${msg}`);
    process.exit(1);
  }
})();
