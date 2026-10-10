'use strict';

/*
 * Import the ONS 2021 Output Area population-weighted centroids (England & Wales) into MongoDB (collection
 * OaCentroid), ONCE. Needed for Neighbourhood Insights' radius (centroid-in-radius) figures. Render's filesystem
 * is ephemeral, so we store the centroids in Mongo (like the IMD import) rather than a file on disk. Idempotent
 * (upserts by OA code). Open data, OGL v3.0.
 *
 * Download (ONS Open Geography Portal, geoportal.statistics.gov.uk): "Output Areas (December 2021) EW Population
 * Weighted Centroids (V4)" (V3 is superseded / now inaccessible). Download the CSV (~22 MB, 188,880 rows =
 * 178,605 England + 10,275 Wales). Columns include UPPERCASE X, Y = British National Grid eastings/northings
 * (plus FID, OA21CD, GlobalID, GlobalID_2; a BOM is present) — that's FINE: the importer reads uppercase X/Y and
 * auto-converts BNG → WGS84 lat/long. Lat/long columns are also accepted if your file has them. Owner-verified
 * 11 Oct 2026: all 188,880 rows parsed, 0 unparsed; lat 49.913–55.786, lng -6.353–1.756.
 *
 * Usage (PowerShell), from a machine with the file + DB access (NOT the build sandbox). NEVER type, echo, print,
 * Substring or Write-Host the connection string — a password shown on screen must be treated as exposed. Use
 * Get-Credential so the password is prompted, not pasted into your command history:
 *   cd vendora-pos\backend
 *   $env:NODE_OPTIONS="--require ./scripts/dns-8888.js"        # only if the mongodb+srv SRV lookup is blocked
 *   $cred = Get-Credential -UserName "vendora_test" -Message "Atlas password"
 *   $pw   = [System.Net.NetworkCredential]::new('', $cred.Password).Password
 *   $env:MONGODB_URI = "mongodb+srv://$($cred.UserName):$pw@<cluster-host>/vendora_test?retryWrites=true&w=majority"
 *   node scripts/import-centroids.js "C:\path\Output_Areas_2021_EW_PWC_V4.csv"   # test DB first, then vendora_pilot
 *   Remove-Item Env:MONGODB_URI                                # clear the secret from the session
 *
 * Expect a running count finishing ~188,880 centroids (upsert — re-running is safe). If the URI (hence the
 * password) was ever pasted or shown on screen, ROTATE the DB user's password afterwards and update MONGODB_URI
 * on Render.
 */
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const mongoose = require('mongoose');
const OaCentroid = require('../src/models/OaCentroid');
const centroids = require('../src/services/insightsData/centroids');
const config = require('../src/config');

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) { console.error('Usage: node scripts/import-centroids.js "<path to OA 2021 PWC CSV/NDJSON>"'); process.exit(2); }
  if (!fs.existsSync(csvPath)) { console.error(`File not found: ${csvPath}`); process.exit(1); }

  const uri = process.env.MONGODB_URI || config.mongodb.uri;
  console.log(`Connecting to Mongo (${uri.replace(/\/\/[^@]*@/, '//***@')}) …`);
  await mongoose.connect(uri);

  const isNdjson = /\.(ndjson|jsonl)$/i.test(csvPath);
  let ops = []; let imported = 0; let skipped = 0;

  const flush = async () => { if (!ops.length) return; await OaCentroid.bulkWrite(ops, { ordered: false }); imported += ops.length; ops = []; process.stdout.write(`\r  upserted ${imported} …`); };
  const handle = (row) => {
    const c = centroids.parseLatLng(row);
    if (!c) { skipped += 1; return; }
    ops.push({ updateOne: { filter: { oa: c.oa }, update: { $set: { lat: c.lat, lng: c.lng } }, upsert: true } });
  };

  if (isNdjson) {
    const readline = require('readline');
    const rl = readline.createInterface({ input: fs.createReadStream(csvPath), crlfDelay: Infinity });
    for await (const line of rl) { const t = line.trim(); if (!t) continue; try { handle(JSON.parse(t)); } catch { skipped += 1; } if (ops.length >= 2000) await flush(); }
  } else {
    const parser = fs.createReadStream(path.resolve(csvPath)).pipe(parse({ columns: true, skip_empty_lines: true, bom: true, trim: true }));
    for await (const row of parser) { handle(row); if (ops.length >= 2000) await flush(); }
  }
  await flush();

  const total = await OaCentroid.estimatedDocumentCount();
  console.log(`\nDone. Upserted ${imported} rows (${skipped} skipped — no usable OA/lat/long). Collection now ~${total} centroids.`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error('\nImport failed:', e.message); process.exit(1); });
