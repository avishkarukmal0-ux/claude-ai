'use strict';

/*
 * Live check for the real neighbourhood data pipeline — RUN FROM A MACHINE WITH NETWORK ACCESS (your PC).
 * It is NOT part of any production path and ships no sample data: it calls the real upstreams and prints what
 * they actually return. The build/CI sandbox cannot reach these hosts, so this is how the end-to-end path and
 * the real dataset id get verified.
 *
 * It prints, for a postcode you give it:
 *   - postcodes.io   : HTTP status + the area codes (lsoa21/msoa21/ward/district/country)
 *   - ONS or Nomis   : HTTP status + ONE real figure (population)
 *   - freshness fields: source, datasetId, edition/version, referenceDate, dataset last_updated, fetchedAt
 *
 * Usage (PowerShell examples are in obsidian-vault/Deployment-Config.md):
 *   # ONS source:
 *   $env:NEIGHBOURHOOD_SOURCE="ons"
 *   $env:ONS_USER_AGENT="vendora/1.0.0 (you@example.com +https://claude-ai-indol.vercel.app)"
 *   $env:NEIGHBOURHOOD_POP_DATASET="<ons-population-dataset-id>"
 *   node scripts/neighbourhood-live-check.js "RM10 8AA"
 *
 *   # Nomis source (optional secret UID removes the 25k-cell guest cap):
 *   $env:NEIGHBOURHOOD_SOURCE="nomis"; $env:NEIGHBOURHOOD_POP_DATASET="NM_xxxx_1"; $env:NOMIS_UID="<secret>"
 *   node scripts/neighbourhood-live-check.js "RM10 8AA"
 *
 * If NEIGHBOURHOOD_POP_DATASET is unset, it still verifies postcodes.io and prints how to discover the id.
 */
/* eslint-disable no-console */

process.env.NEIGHBOURHOOD_ENABLED = process.env.NEIGHBOURHOOD_ENABLED || 'true';

const svc = require('../src/services/neighbourhoodService');
const config = require('../src/config');

async function main() {
  const postcode = process.argv.slice(2).join(' ').trim();
  if (!postcode) { console.error('Usage: node scripts/neighbourhood-live-check.js "<postcode>"'); process.exit(2); }

  const C = config.neighbourhood;
  console.log('\n=== Neighbourhood live check ===');
  console.log(`source            : ${C.source}`);
  console.log(`dataset (pop)     : ${C.populationDataset || '(unset — discovery steps below)'}`);
  console.log(`ONS User-Agent    : ${C.userAgent}`);
  console.log(`Nomis UID         : ${C.nomisUid ? '(set, hidden)' : '(not set — guest, 25k-cell cap)'}`);

  // Wrap the real transport so every upstream call prints its HTTP status (transparency for the report).
  const realFetch = (url, opts = {}) => fetch(url, opts);
  svc.__setTransport(async (url, { headers = {} } = {}) => {
    const t0 = Date.now();
    const res = await realFetch(url, { headers: { 'User-Agent': C.userAgent, ...headers } });
    const text = await res.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    console.log(`  → ${res.status}  ${url.split('?')[0]}  (${Date.now() - t0}ms)`);
    return { status: res.status, headers: { 'retry-after': res.headers.get('retry-after') }, body };
  });

  try {
    console.log('\n[1] postcodes.io — resolve area codes');
    const area = await svc.resolvePostcode(postcode);
    console.log('    area codes:', JSON.stringify(area, null, 0));

    if (!C.populationDataset) {
      console.log('\n[2] No NEIGHBOURHOOD_POP_DATASET set — discover the id, then re-run:');
      console.log('    Nomis: curl "https://www.nomisweb.co.uk/api/v01/dataset/def.sdmx.json"  (find the population NM_xxxx_1)');
      console.log('    ONS  : curl "https://api.beta.ons.gov.uk/v1/datasets?limit=338"          (find the population dataset slug)');
      process.exit(0);
    }

    console.log(`\n[2] ${C.source.toUpperCase()} — fetch one real figure`);
    const fig = await svc.fetchPopulation(area);
    if (!fig) {
      console.log('    ✗ No usable figure returned. Check the dataset id / dimensions for this source, then re-run.');
      process.exit(1);
    }
    fig.fetchedAt = new Date();
    console.log('\n=== RESULT (real figure + freshness) ===');
    console.log(`    ${fig.label}: ${Number(fig.value).toLocaleString('en-GB')} ${fig.unit || ''}`.trim());
    console.log(`    source        : ${fig.source}`);
    console.log(`    datasetId     : ${fig.datasetId}`);
    console.log(`    edition       : ${fig.edition || '-'}`);
    console.log(`    version       : ${fig.version || '-'}`);
    console.log(`    geography     : ${fig.geography} ${fig.geographyCode}`);
    console.log(`    referenceDate : ${fig.referenceDate}`);
    console.log(`    last_updated  : ${fig.lastUpdated || '(not provided by source)'}`);
    console.log(`    fetchedAt     : ${fig.fetchedAt.toISOString()}`);
    console.log(`    freshness     : ${svc.freshnessOf({ fetchedAt: fig.fetchedAt })}`);
    console.log(`    attribution   : ${fig.attribution}`);
    console.log('\n✓ End-to-end live check OK. These are the real figures the deployed route will return + cache.\n');
  } catch (err) {
    console.error(`\n✗ Live check failed: ${err.message}`);
    process.exit(1);
  }
}

main();
