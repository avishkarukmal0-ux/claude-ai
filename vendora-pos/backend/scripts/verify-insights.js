'use strict';

/*
 * Verify the Neighbourhood Insights census pipeline against the OFFICIAL source, for a known location.
 * Runs in the OPERATOR's environment (needs outbound network to postcodes.io + Nomis, and the OA centroids
 * file). It is NOT run in CI / the build sandbox (egress is blocked there).
 *
 * Usage:
 *   INSIGHTS_DATA_PROVIDER=nomis \
 *   INSIGHTS_CENTROIDS_PATH=/data/oa21_pwc.csv \
 *   node scripts/verify-insights.js "EC1A 1BB" 1000
 *
 * What it does:
 *   1. Resolves the postcode → point + country (must be England/Wales).
 *   2. Loads the OA population-weighted centroids and selects the OAs within the radius (centroid-in-radius).
 *   3. Fetches + aggregates the Census 2021 counts for those OAs via the Nomis adapter.
 *   4. Prints population / households / Output-Area count and the category breakdowns.
 *
 * HOW TO CHECK IT'S RIGHT: pick a whole administrative area (or compare a single OA) and confirm the adapter's
 * per-OA figures match the published ONS Census 2021 table on nomisweb.co.uk / ons.gov.uk for that OA. If the
 * dataset ids or dimension names in services/insightsData/nomis.js are wrong for the current Nomis catalogue,
 * fix them (or override via INSIGHTS_NOMIS_TABLES_PATH) and re-run until the figures reconcile.
 */
/* eslint-disable no-console */

async function main() {
  const [postcode, radiusArg] = process.argv.slice(2);
  const radiusM = Number(radiusArg) || 1000;
  if (!postcode) { console.error('Usage: node scripts/verify-insights.js "<postcode>" <radiusM>'); process.exit(2); }

  const loc = require('../src/services/insightsLocation');
  const centroids = require('../src/services/insightsData/centroids');
  const nomis = require('../src/services/insightsData/nomis');
  const geo = require('../src/services/insightsGeo');

  console.log(`\n▶ Resolving ${postcode} …`);
  const location = await loc.resolvePostcode(postcode);
  if (!location.ok) { console.error(`  ✗ ${location.reason}`); process.exit(1); }
  if (!location.supported) { console.error(`  ✗ ${location.reason}`); process.exit(1); }
  console.log(`  ✓ ${location.postcode} — ${location.admin} (${location.country}) @ ${location.point.lat}, ${location.point.lng}`);

  const c = await centroids.load();
  if (!c.loaded) { console.error(`  ✗ centroids not loaded: ${c.reason}`); process.exit(1); }
  console.log(`  ✓ centroids loaded: ${c.count.toLocaleString()} OAs`);

  const selected = geo.selectAreasInRadius(centroids.all(), location.point, radiusM);
  console.log(`  ✓ ${selected.length} Output Areas within ${radiusM} m (nearest: ${selected.slice(0, 3).map((s) => `${s.oa}@${s.distance}m`).join(', ')})`);

  console.log('▶ Fetching + aggregating Census 2021 counts via Nomis …');
  const profiles = await nomis.fetchAreaProfiles(location.point, radiusM);
  const agg = geo.combineAreaProfile(profiles, { radiusM });

  console.log('\n=== ESTIMATED area profile ===');
  console.log(`Output Areas : ${agg.outputAreas}`);
  console.log(`Population    : ${agg.population.toLocaleString()} (est.)`);
  console.log(`Households    : ${agg.households.toLocaleString()} (est.)`);
  for (const [cat, rows] of Object.entries(agg.categories)) {
    console.log(`\n${cat}:`);
    for (const r of rows.slice(0, 6)) console.log(`  ${r.display.padStart(10)}  ${r.pct != null ? `${r.pct}%  ` : ''}${r.label}`);
  }
  console.log('\nNow compare one OA\'s figures above against the published ONS Census 2021 table for that OA.');
  console.log('If they reconcile, the dataset ids + dimensions in nomis.js are correct for this catalogue.\n');
}

main().catch((e) => { console.error('verify failed:', e && e.message ? e.message : e); process.exit(1); });
