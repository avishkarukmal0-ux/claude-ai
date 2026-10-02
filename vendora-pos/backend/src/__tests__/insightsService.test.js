'use strict';

// Neighbourhood Insights service — status/preview/profile honesty. No DB, no network (location transport is
// mocked). The census data provider is OFF by default, so profiles must come back configured:false (never
// fabricated numbers).
const insights = require('../services/insightsService');
const loc = require('../services/insightsLocation');
const { isActive } = require('../services/insightsEntitlementService');

const EW = { status: 200, json: { result: { country: 'England', latitude: 51.5, longitude: -0.1, postcode: 'EC1A 1BB', admin_district: 'Islington', codes: { oa: 'E00000001', lsoa: 'E01000001' } } } };
const SCOT = { status: 200, json: { result: { country: 'Scotland', latitude: 55.95, longitude: -3.19, postcode: 'EH1 1AA', codes: {} } } };

afterEach(() => loc.__setTransport(null));

describe('insightsService.status / preview (honest, pre-purchase)', () => {
  test('status reports E&W coverage, census source, and data NOT configured by default', () => {
    const s = insights.status();
    expect(s.coverage).toBe('England and Wales');
    expect(s.dataSource).toBe('ONS Census 2021');
    expect(s.dataConfigured).toBe(false);     // no provider by default
    expect(s.radii).toEqual([500, 1000, 3000]);
  });

  test('preview shows category structure + explicit limitations, flagged as not the owner’s area', () => {
    const p = insights.preview();
    expect(p.note).toMatch(/not your area/i);
    expect(p.shows.map((x) => x.key)).toEqual(expect.arrayContaining(['population', 'ethnicGroup', 'language', 'age', 'householdComposition']));
    expect(p.limitations.join(' ')).toMatch(/estimate/i);
    expect(p.limitations.join(' ')).toMatch(/potential customers/i);
    expect(p.attribution).toMatch(/Open Government Licence/);
  });
});

describe('insightsService.buildProfile — honest with no data provider', () => {
  test('rejects an unsupported radius', async () => {
    loc.__setTransport(async () => EW);
    const out = await insights.buildProfile({ postcode: 'EC1A 1BB', radiusM: 750 });
    expect(out.ok).toBe(false);
    expect(out.reason).toMatch(/supported radius/i);
  });

  test('a Scotland postcode is valid but NOT supported (separate census), never mixed with E&W', async () => {
    loc.__setTransport(async () => SCOT);
    const out = await insights.buildProfile({ postcode: 'EH1 1AA', radiusM: 1000 });
    expect(out.ok).toBe(true);
    expect(out.supported).toBe(false);
    expect(out.reason).toMatch(/Scotland/);
    expect(out.profile).toBeUndefined(); // no numbers
  });

  test('a supported postcode with no data provider → configured:false + labelled preview, no fabricated numbers', async () => {
    loc.__setTransport(async () => EW);
    const out = await insights.buildProfile({ postcode: 'EC1A 1BB', radiusM: 1000 });
    expect(out.ok).toBe(true);
    expect(out.supported).toBe(true);
    expect(out.configured).toBe(false);
    expect(out.profile).toBeUndefined();
    expect(out.preview).toBeTruthy();
    expect(out.location.postcode).toBe('EC1A 1BB');
    expect(out.reason).toMatch(/isn’t configured|not configured/i);
  });

  test('an invalid postcode is rejected', async () => {
    loc.__setTransport(async () => ({ status: 404, json: null }));
    const out = await insights.buildProfile({ postcode: 'ZZ99 9ZZ', radiusM: 500 });
    expect(out.ok).toBe(false);
  });
});

describe('insightsEntitlement.isActive (server-enforced)', () => {
  const now = 1000000;
  test('none → no access', () => { expect(isActive({ status: 'none' }, now)).toBe(false); });
  test('active with no period end → access', () => { expect(isActive({ status: 'active' }, now)).toBe(true); });
  test('active but period ended → no access', () => { expect(isActive({ status: 'active', currentPeriodEnd: now - 1 }, now)).toBe(false); });
  test('cancelled → no access', () => { expect(isActive({ status: 'cancelled' }, now)).toBe(false); });
});
