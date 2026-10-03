'use strict';

// Census DATA adapter (Nomis) — DB-FREE, offline-verifiable with injected centroids + a stub transport:
//  - centroid-in-radius selection: different radii select different Output Areas → genuinely different totals
//  - per-OA assembly (population = Σ age, households = Σ household composition) then aggregation + suppression
//  - no-centroids → throws (so the service reports configured:false, never fabricated numbers)
//  - Nomis `.data.json` parsing sums the breakdown and drops the Total row
const nomis = require('../services/insightsData/nomis');
const centroids = require('../services/insightsData/centroids');
const geo = require('../services/insightsGeo');

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

beforeEach(() => { centroids.__setForTest(CENTROIDS); nomis.__setTransport(stubTransport()); nomis.clearCache(); });
afterEach(() => { centroids.__setForTest(null); nomis.__setTransport(null); nomis.clearCache(); });

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
