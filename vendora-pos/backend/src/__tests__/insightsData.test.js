'use strict';

// Census DATA adapter (Nomis) — DB-FREE, offline-verifiable with injected centroids + a stub transport:
//  - centroid-in-radius selection: different radii select different Output Areas → genuinely different totals
//  - per-OA assembly (population = Σ age, households = Σ household composition) then aggregation + suppression
//  - no-centroids → throws (so the service reports configured:false, never fabricated numbers)
//  - Nomis `.data.json` parsing sums the breakdown and drops the Total row
const nomis = require('../services/insightsData/nomis');
const centroids = require('../services/insightsData/centroids');
const oaStore = require('../services/insightsData/oaStore');
const geo = require('../services/insightsGeo');
const insights = require('../services/insightsService');

const POINT = { lat: 51.5000, lng: -0.1000 };
// A = at the point; B ≈ 300 m north; C ≈ 2 km north.
const CENTROIDS = [
  { oa: 'E00000A', lat: 51.5000, lng: -0.1000 },
  { oa: 'E00000B', lat: 51.5027, lng: -0.1000 },
  { oa: 'E00000C', lat: 51.5180, lng: -0.1000 },
];

// A stub Nomis transport: reads the dataset id + requested OA codes from the URL and returns a representative
// `.data.json`. Each OA gets fixed per-table counts so totals are predictable.
function stubTransport() {
  const PER_OA = {
    NM_2020_1: { dim: 'c2021_age_6', rows: { 'Aged 15 years and under': 20, 'Aged 16 to 64 years': 60, 'Total: All usual residents': 100 } }, // Total must be ignored
    NM_2023_1: { dim: 'c2021_hhcomp_6', rows: { 'One-person household': 10, 'Family household': 25 } },
    NM_2041_1: { dim: 'c2021_eth_20', rows: { 'White': 70, 'Asian': 8 } }, // 'Asian' 8 < MIN_CELL → suppressed after aggregation if small
    NM_2045_1: { dim: 'c2021_lang_8', rows: { 'English': 75, 'Polish': 5 } },
    NM_2024_1: { dim: 'c2021_cob_12', rows: { 'United Kingdom': 65, 'Poland': 10, 'India': 5 } }, // country of birth
    NM_2083_1: { dim: 'c2021_eastat_20', rows: { 'Employee': 55, 'Self-employed': 12, 'Unemployed': 6 } }, // economic activity
    NM_2084_1: { dim: 'c2021_hiqual_8', rows: { 'Level 4 or above': 40, 'No qualifications': 20 } }, // qualifications
  };
  return async (url) => {
    const dataset = (url.match(/dataset\/([^.]+)\.data\.json/) || [])[1];
    const geogEnc = (url.match(/geography=([^&]+)/) || [])[1] || '';
    const oas = decodeURIComponent(geogEnc).split(',').filter(Boolean);
    const def = PER_OA[dataset];
    const obs = [];
    for (const oa of oas) {
      for (const [label, value] of Object.entries(def.rows)) {
        obs.push({ geography: { geogcode: oa }, [def.dim]: { description: label }, obs_value: { value } });
      }
    }
    return { obs };
  };
}

// oaStore has a process-wide in-memory layer (L1 in front of Mongo) that persists across calls — reset it per
// test so one test's cached OAs don't suppress another's Nomis fetches (which the dataset-count assertions rely on).
beforeEach(() => { centroids.__setForTest(CENTROIDS); nomis.__setTransport(stubTransport()); nomis.clearCache(); oaStore.__reset(); });
afterEach(() => { centroids.__setForTest(null); nomis.__setTransport(null); nomis.clearCache(); oaStore.__reset(); });

describe('nomis.parseObs', () => {
  test('sums a dimension by description and drops the Total row', () => {
    const json = { obs: [
      { geography: { geogcode: 'E1' }, c2021_age_6: { description: 'Aged 16 to 64 years' }, obs_value: { value: 60 } },
      { geography: { geogcode: 'E1' }, c2021_age_6: { description: 'Total: All usual residents' }, obs_value: { value: 100 } },
    ] };
    const out = nomis.parseObs(json, 'c2021_age_6');
    expect(out.E1['Aged 16 to 64 years']).toBe(60);
    expect(out.E1['Total: All usual residents']).toBeUndefined();
  });

  test('AUTO-DETECTS the breakdown dimension when the configured name does not match (the 0-figures bug)', () => {
    // Nomis's real field name differs from the hardcoded hint → the old parser found nothing (→ 0). Now it
    // falls back to the varying descriptive dimension and still reads the counts.
    const json = { obs: [
      { geography: { geogcode: 'E1' }, c2021_age_DIFFERENT: { description: 'Aged 16 to 64 years' }, obs_value: { value: 60 } },
      { geography: { geogcode: 'E1' }, c2021_age_DIFFERENT: { description: 'Total: All usual residents' }, obs_value: { value: 100 } },
    ] };
    const out = nomis.parseObs(json, 'c2021_age_6'); // deliberately wrong hint
    expect(out.E1['Aged 16 to 64 years']).toBe(60);
    expect(out.E1['Total: All usual residents']).toBeUndefined();
  });
});

describe('nomis.fetchAreaProfiles — centroid-in-radius', () => {
  test('throws when centroids are not loaded (→ service shows configured:false)', async () => {
    centroids.__setForTest(null);
    await expect(nomis.fetchAreaProfiles(POINT, 1000)).rejects.toThrow(/centroids/i);
  });

  test('500 m selects the two nearby OAs; 3 km also includes the far OA', async () => {
    const near = await nomis.fetchAreaProfiles(POINT, 500);
    expect(near.map((p) => p.oa).sort()).toEqual(['E00000A', 'E00000B']);
    nomis.clearCache();
    const far = await nomis.fetchAreaProfiles(POINT, 3000);
    expect(far.map((p) => p.oa).sort()).toEqual(['E00000A', 'E00000B', 'E00000C']);
  });

  test('per-OA population = Σ age breakdown (Total excluded); households = Σ composition', async () => {
    const [oa] = await nomis.fetchAreaProfiles(POINT, 500);
    expect(oa.population).toBe(80);   // 20 + 60 (not 100)
    expect(oa.households).toBe(35);   // 10 + 25
  });

  test('different radii yield different aggregate totals (not the same for every radius)', async () => {
    const near = geo.combineAreaProfile(await nomis.fetchAreaProfiles(POINT, 500), { radiusM: 500 });
    nomis.clearCache();
    const far = geo.combineAreaProfile(await nomis.fetchAreaProfiles(POINT, 3000), { radiusM: 3000 });
    expect(near.outputAreas).toBe(2);
    expect(far.outputAreas).toBe(3);
    expect(far.population).toBeGreaterThan(near.population); // 3 OAs > 2 OAs
    expect(near.population).toBe(160); // 2 × 80
    expect(far.population).toBe(240);  // 3 × 80
  });

  test('headlineOnly fetches ONLY the age + household tables (2, not 4) and still gives population + households', async () => {
    const seen = [];
    const base = stubTransport();
    nomis.__setTransport(async (url) => { seen.push((url.match(/dataset\/([^.]+)\.data\.json/) || [])[1]); return base(url); });
    const profiles = await nomis.fetchAreaProfiles(POINT, 500, { headlineOnly: true });
    const datasets = [...new Set(seen)].sort();
    expect(datasets).toEqual(['NM_2020_1', 'NM_2023_1']);       // age + household composition only
    expect(datasets).not.toContain('NM_2041_1');                // ethnic group skipped
    expect(datasets).not.toContain('NM_2045_1');                // language skipped
    const [oa] = profiles;
    expect(oa.population).toBe(80);                             // still correct (Σ age, Total excluded)
    expect(oa.households).toBe(35);                             // still correct (Σ composition)
    expect(Object.keys(oa.categories.ethnicGroup)).toHaveLength(0); // no breakdowns fetched
    expect(Object.keys(oa.categories.language)).toHaveLength(0);
  });

  test('a headline cache is NOT reused for a full request (the full profile still gets every breakdown)', async () => {
    const seen = [];
    const base = stubTransport();
    nomis.__setTransport(async (url) => { seen.push((url.match(/dataset\/([^.]+)\.data\.json/) || [])[1]); return base(url); });
    await nomis.fetchAreaProfiles(POINT, 500, { headlineOnly: true }); // caches under the headline key only
    seen.length = 0;
    const full = await nomis.fetchAreaProfiles(POINT, 500);            // must NOT read the headline cache
    const datasets = [...new Set(seen)].sort();
    // The five breakdown tables are fetched on the full request (the invariant: a headline cache never satisfies a
    // full one). Age + household are NOT re-fetched here — the per-OA oaStore already has them from the headline
    // call — but their data is still present in the result (served from that cache).
    expect(datasets).toEqual(['NM_2024_1', 'NM_2041_1', 'NM_2045_1', 'NM_2083_1', 'NM_2084_1']);
    expect(full[0].population).toBe(80);                                            // age served from the OA cache
    expect(full[0].households).toBe(35);                                            // household served from the OA cache
    expect(Object.keys(full[0].categories.ethnicGroup).length).toBeGreaterThan(0);  // full breakdowns present
    expect(Object.keys(full[0].categories.countryOfBirth).length).toBeGreaterThan(0); // incl. country of birth
    expect(Object.keys(full[0].categories.economicActivity).length).toBeGreaterThan(0); // incl. economic activity
    expect(Object.keys(full[0].categories.qualifications).length).toBeGreaterThan(0); // incl. qualifications
  });

  test('a full cache DOES satisfy a later headline request (no refetch)', async () => {
    const seen = [];
    const base = stubTransport();
    nomis.__setTransport(async (url) => { seen.push((url.match(/dataset\/([^.]+)\.data\.json/) || [])[1]); return base(url); });
    await nomis.fetchAreaProfiles(POINT, 500);                 // full → cached under the base key
    seen.length = 0;
    const head = await nomis.fetchAreaProfiles(POINT, 500, { headlineOnly: true });
    expect(seen).toHaveLength(0);                              // served from the full cache, no new fetch
    expect(head[0].population).toBe(80);
  });

  test('a broken country-of-birth table is fault-isolated (headline + other breakdowns still work)', async () => {
    const base = stubTransport();
    // Simulate an unverified/wrong country-of-birth dataset id: Nomis errors for NM_2024_1, others fine.
    nomis.__setTransport(async (url) => {
      if (/dataset\/NM_2024_1\./.test(url)) { const e = new Error('Nomis HTTP 404'); e.status = 404; throw e; }
      return base(url);
    });
    const full = await nomis.fetchAreaProfiles(POINT, 500); // full profile, but country-of-birth fetch fails
    const oa = full[0];
    expect(oa.population).toBe(80);                                   // headline intact
    expect(oa.households).toBe(35);
    expect(Object.keys(oa.categories.ethnicGroup).length).toBeGreaterThan(0);   // other breakdowns intact
    expect(Object.keys(oa.categories.language).length).toBeGreaterThan(0);
    expect(Object.keys(oa.categories.countryOfBirth)).toHaveLength(0); // just empty, never wrong, never thrown
  });

  test('aggregate preserves small-cell suppression', async () => {
    const agg = geo.combineAreaProfile(await nomis.fetchAreaProfiles(POINT, 500), { radiusM: 500 });
    const eth = agg.categories.ethnicGroup;
    const asian = eth.find((r) => r.label === 'Asian'); // 8 per OA × 2 = 16 → above MIN_CELL once aggregated
    const white = eth.find((r) => r.label === 'White');
    expect(white.count).toBe(140);
    expect(asian.count).toBe(16);
    // A genuinely tiny aggregate cell is suppressed:
    const tiny = geo.combineAreaProfile([{ oa: 'X', population: 5, households: 2, categories: { ethnicGroup: { Other: 3 } } }], { radiusM: 500 });
    expect(tiny.categories.ethnicGroup[0].suppressed).toBe(true);
    expect(tiny.categories.ethnicGroup[0].display).toMatch(/fewer than/);
  });
});

describe('oaStore + per-OA durable cache (fetch-only-missing + timings)', () => {
  const T = nomis.DEFAULT_TABLES;

  test('oaStore.put/get round-trips per (dataset, oa) in memory; empty counts still count as "known"', async () => {
    await oaStore.put('NM_X', new Map([['E1', { a: 1 }], ['E2', {}]]));
    const got = await oaStore.get('NM_X', ['E1', 'E2', 'E3']);
    expect(got.get('E1')).toEqual({ a: 1 });
    expect(got.has('E2')).toBe(true);  // an OA Nomis returned nothing for is remembered → not re-queried
    expect(got.has('E3')).toBe(false); // never stored → the caller must fetch it
  });

  test('fetchTable asks Nomis for each OA only once, then serves it from the store (only missing OAs refetched)', async () => {
    const asked = [];
    const base = stubTransport();
    nomis.__setTransport(async (url) => {
      const oas = decodeURIComponent((url.match(/geography=([^&]+)/) || [])[1] || '').split(',').filter(Boolean);
      asked.push(...oas);
      return base(url);
    });
    const r1 = {};
    await nomis.fetchTable(T.age, ['E00000A', 'E00000B'], r1);
    expect(asked.sort()).toEqual(['E00000A', 'E00000B']);
    expect(r1.oaFetched).toBe(2);
    expect(r1.dataset).toBe('NM_2020_1');
    expect(typeof r1.ms).toBe('number');
    asked.length = 0;
    const r2 = {};
    const out = await nomis.fetchTable(T.age, ['E00000A', 'E00000B', 'E00000C'], r2); // A,B cached → only C new
    expect(asked).toEqual(['E00000C']);
    expect(r2.oaFromMem).toBe(2);
    expect(r2.oaFetched).toBe(1);
    expect(out.E00000A['Aged 16 to 64 years']).toBe(60); // A still returned, from the cache
    expect(out.E00000C['Aged 16 to 64 years']).toBe(60); // C freshly fetched
  });

  test('a 429 with Retry-After is retried (bounded) and then succeeds', async () => {
    const base = stubTransport();
    let hits = 0;
    nomis.__setTransport(async (url) => {
      hits += 1;
      if (hits === 1) { const e = new Error('Nomis HTTP 429'); e.status = 429; e.retryAfter = '0'; throw e; } // first call rate-limited
      return base(url);
    });
    const r = {};
    const out = await nomis.fetchTable(T.age, ['E00000A'], r); // retries after 0s, then succeeds
    expect(hits).toBe(2);
    expect(out.E00000A['Aged 16 to 64 years']).toBe(60);
  });

  test('fetchAreaProfiles records per-step timings (centroid load, OA select, per-table)', async () => {
    await nomis.fetchAreaProfiles(POINT, 500, { headlineOnly: true });
    const tm = nomis.lastTimings();
    expect(tm).toBeTruthy();
    expect(typeof tm.centroidsLoadMs).toBe('number');
    expect(tm.oaSelected).toBeGreaterThan(0);
    expect(Array.isArray(tm.tables)).toBe(true);
    expect(tm.tables).toHaveLength(2); // headline = age + household composition
    expect(tm.tables[0].dataset).toBeTruthy();
    expect(typeof tm.nomisTotalMs).toBe('number');
  });
});

describe('insightsService.radiusDeprivation — IMD averaged over the radius via OA→LSOA', () => {
  const AREAS = [
    { oa: 'E00000A', population: 100 },
    { oa: 'E00000B', population: 200 },
    { oa: 'E00000C', population: 300 },
  ];
  // A→LSOA1, B→LSOA1, C→LSOA2
  const WITH_LSOA = [
    { oa: 'E00000A', lat: 51.5, lng: -0.1, lsoa: 'E01000001' },
    { oa: 'E00000B', lat: 51.5, lng: -0.1, lsoa: 'E01000001' },
    { oa: 'E00000C', lat: 51.5, lng: -0.1, lsoa: 'E01000002' },
  ];
  const imdLookup = async (lsoa) => ({ E01000001: { decile: 3, score: 40 }, E01000002: { decile: 7, score: 10 } }[lsoa] || null);

  test('population-weighted average across the radius LSOAs', async () => {
    centroids.__setForTest(WITH_LSOA);
    const dep = await insights.radiusDeprivation(AREAS, imdLookup);
    // LSOA1 pop = 300 (dec 3), LSOA2 pop = 300 (dec 7) → weighted decile (300*3+300*7)/600 = 5
    expect(dep).toBeTruthy();
    expect(dep.decile).toBe(5);
    expect(dep.score).toBe(25);
    expect(dep.lsoaCount).toBe(2);
    expect(dep.estimated).toBe(true);
    centroids.__setForTest(null);
  });

  test('returns null when centroids carry no LSOA mapping (not imported) → UI keeps own-area figure', async () => {
    centroids.__setForTest([{ oa: 'E00000A', lat: 51.5, lng: -0.1 }]); // no lsoa
    const dep = await insights.radiusDeprivation(AREAS, imdLookup);
    expect(dep).toBeNull();
    centroids.__setForTest(null);
  });
});
