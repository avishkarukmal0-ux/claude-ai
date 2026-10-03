'use strict';

/*
 * Import the English Indices of Deprivation 2025 into MongoDB (collection ImdArea), ONCE.
 * Run on a machine with the CSV + DB access (NOT the build sandbox). Idempotent (upserts by LSOA code).
 *
 * Download (official, OGL v3.0):
 *   "File_7_IoD2025_All_Ranks_Scores_Deciles_Population_Denominators.csv" (~9.44 MB) from gov.uk
 *   https://assets.publishing.service.gov.uk/media/691ded56d140bbbaa59a2a7d/
 *
 * Usage (PowerShell):
 *   cd vendora-pos\backend
 *   $env:MONGODB_URI="<your Atlas URI for vendora_pilot>"   # or a test DB
 *   node scripts/import-imd.js "C:\path\to\File_7_IoD2025_All_Ranks_Scores_Deciles_Population_Denominators.csv"
 *
 * It reads the header row, locates the LSOA-code / IMD-score / IMD-rank / IMD-decile columns tolerantly,
 * sets rankOf to the number of ranked England LSOAs, and upserts each row. England only (E-codes).
 */
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const mongoose = require('mongoose');
const ImdArea = require('../src/models/ImdArea');
const imd = require('../src/services/imdService');
const config = require('../src/config');

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) { console.error('Usage: node scripts/import-imd.js "<path to IoD2025 File_7 CSV>"'); process.exit(2); }
  if (!fs.existsSync(csvPath)) { console.error(`File not found: ${csvPath}`); process.exit(1); }

  const uri = process.env.MONGODB_URI || config.mongodb.uri;
  console.log(`Connecting to Mongo (${uri.replace(/\/\/[^@]*@/, '//***@')}) …`);
  await mongoose.connect(uri);

  // First pass: read header + collect England rows.
  const records = [];
  let cols = null;
  await new Promise((resolve, reject) => {
    fs.createReadStream(path.resolve(csvPath))
      .pipe(parse({ columns: true, skip_empty_lines: true, bom: true, trim: true }))
      .on('data', (row) => {
        if (!cols) { try { cols = imd.columnMap(Object.keys(row)); } catch (e) { reject(e); return; } }
        const doc = imd.rowToDoc(row, cols);
        if (doc) records.push(doc);
      })
      .on('end', resolve)
      .on('error', reject);
  });

  if (!records.length) { console.error('No England LSOA rows parsed — check the CSV/columns.'); process.exit(1); }
  const rankOf = records.length; // number of ranked England LSOAs (e.g. 33,755)
  console.log(`Parsed ${rankOf.toLocaleString()} England LSOA rows. Upserting …`);

  const ops = records.map((d) => ({
    updateOne: { filter: { lsoa21: d.lsoa21 }, update: { $set: { ...d, rankOf, source: 'English indices of deprivation 2025', referenceDate: 'IMD 2025 (30 Oct 2025)' } }, upsert: true },
  }));
  // Write in batches to keep memory + payloads sane.
  for (let i = 0; i < ops.length; i += 2000) {
    await ImdArea.bulkWrite(ops.slice(i, i + 2000), { ordered: false });
    process.stdout.write(`  …${Math.min(i + 2000, ops.length)}/${ops.length}\r`);
  }
  const count = await ImdArea.estimatedDocumentCount();
  console.log(`\n✓ Done. ImdArea now holds ${count.toLocaleString()} rows.`);
  const sample = await ImdArea.findOne({ lsoa21: 'E01000036' }).lean();
  console.log('  Sample E01000036:', sample ? `decile ${sample.decile}, rank ${sample.rank} of ${sample.rankOf}, score ${sample.score}` : '(not found)');
  await mongoose.disconnect();
}

main().catch((e) => { console.error('Import failed:', e && e.message ? e.message : e); process.exit(1); });
