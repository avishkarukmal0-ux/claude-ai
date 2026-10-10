'use strict';

/*
 * Import the ONS 2021 Output Area population-weighted centroids (England & Wales) into MongoDB (collection
 * OaCentroid), ONCE. Needed for Neighbourhood Insights' radius (centroid-in-radius) figures. Render's filesystem
 * is ephemeral, so we store the centroids in Mongo (like the IMD import) rather than a file on disk. Idempotent
 * (upserts by OA code). Open data, OGL v3.0.
 *
 * Download (ONS Open Geography Portal): "Output Areas (December 2021) PWC (V3)" / population-weighted centroids,
 * England & Wales, as CSV or NDJSON. The standard ONS export gives the centres as British National Grid
 * eastings/northings (x, y) — that's FINE: the importer auto-converts BNG → lat/long. Lat/long columns are also
 * accepted if your file has them. ~190k rows.
 *   https://geoportal.statistics.gov.uk/  (search: Output Areas 2021 population weighted centroids)
 *
 * Usage (PowerShell), from a machine with the file + DB access (NOT the build sandbox):
 *   cd vendora-pos\backend
 *   # If the mongodb+srv SRV lookup is blocked on your network, force a public resolver:
 *   $env:NODE_OPTIONS="--require ./scripts/dns-8888.js"
 *   $env:MONGODB_URI="<Atlas URI …/vendora_test>"   # test DB first, then vendora_pilot
 *   node scripts/import-centroids.js "C:\path\Output_Areas_2021_PWC.csv"
 *
 * Expect it to print a running count and finish with ~188,880 (E&W) centroids. Re-running is safe (upsert).
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
