'use strict';

// Pure tests for the Neighbourhood Insights geographic + aggregation method — no network, no DB.
const { haversineMeters, selectAreasInRadius, sumCounts, toRows, combineAreaProfile, MIN_CELL } = require('../services/insightsGeo');

describe('insightsGeo.haversineMeters', () => {
  test('≈ known distance (Trafalgar Sq → Buckingham Palace ~1.0km)', () => {
    const d = haversineMeters({ lat: 51.508, lng: -0.1281 }, { lat: 51.5014, lng: -0.1419 });
    expect(d).toBeGreaterThan(900);
    expect(d).toBeLessThan(1300);
  });
  test('zero distance for the same point', () => {
    expect(haversineMeters({ lat: 51.5, lng: -0.1 }, { lat: 51.5, lng: -0.1 })).toBe(0);
  });
  test('missing coords → Infinity (never falsely "in radius")', () => {
    expect(haversineMeters({ lat: 1, lng: 1 }, null)).toBe(Infinity);
  });
});

describe('insightsGeo.selectAreasInRadius (centroid-in-radius)', () => {
  const point = { lat: 51.5, lng: -0.1 };
  const centroids = [
    { oa: 'E00000001', lat: 51.5005, lng: -0.1 },   // ~55m
    { oa: 'E00000002', lat: 51.52, lng: -0.1 },      // ~2.2km
    { oa: 'E00000003', lat: 51.5, lng: -0.108 },     // ~550m
  ];
  test('includes only OAs whose centroid is within the radius, nearest first', () => {
    const r = selectAreasInRadius(centroids, point, 1000);
    expect(r.map((x) => x.oa)).toEqual(['E00000001', 'E00000003']);
    expect(r[0].distance).toBeLessThan(r[1].distance);
  });
  test('a larger radius pulls in more areas', () => {
    expect(selectAreasInRadius(centroids, point, 3000)).toHaveLength(3);
  });
});

describe('insightsGeo.toRows — percentages + small-cell suppression', () => {
  test('rows sorted biggest first with percentages', () => {
    const rows = toRows({ 'White': 600, 'Asian': 300, 'Black': 100 });
    expect(rows[0].label).toBe('White');
    expect(rows[0].pct).toBe(60);
  });
  test('cells below MIN_CELL are suppressed (never shown as an exact tiny figure)', () => {
    const rows = toRows({ 'Group A': 500, 'Group B': 3 });
    const b = rows.find((r) => r.label === 'Group B');
    expect(b.suppressed).toBe(true);
    expect(b.count).toBe(null);
    expect(b.display).toBe(`fewer than ${MIN_CELL}`);
    expect(b.pct).toBe(null);
  });
});

describe('insightsGeo.combineAreaProfile', () => {
  const areas = [
    { oa: 'E1', population: 1000, households: 400, categories: { ethnicGroup: { White: 600, Asian: 300, Black: 100 }, age: { '0-15': 200, '16-64': 650, '65+': 150 } } },
    { oa: 'E2', population: 800, households: 320, categories: { ethnicGroup: { White: 500, Asian: 250, Black: 50 }, age: { '0-15': 160, '16-64': 520, '65+': 120 } } },
  ];
  test('sums population/households across included OAs and marks the result ESTIMATED', () => {
    const p = combineAreaProfile(areas, { radiusM: 1000, meta: { source: 'ONS Census 2021', referenceYear: 2021 } });
    expect(p.population).toBe(1800);
    expect(p.households).toBe(720);
    expect(p.outputAreas).toBe(2);
    expect(p.estimated).toBe(true);
    expect(p.method).toMatch(/centroid-in-radius/);
    expect(p.source).toBe('ONS Census 2021');
    expect(p.categories.ethnicGroup[0]).toMatchObject({ label: 'White', count: 1100 });
    expect(p.sufficient).toBe(true);
  });
  test('empty selection → not sufficient (caller shows "no data for this area")', () => {
    const p = combineAreaProfile([], { radiusM: 500 });
    expect(p.sufficient).toBe(false);
    expect(p.population).toBe(0);
  });
});

describe('insightsGeo.sumCounts', () => {
  test('merges numeric maps, ignores non-numbers', () => {
    expect(sumCounts([{ a: 1, b: 2 }, { a: 3, c: 'x' }])).toEqual({ a: 4, b: 2 });
  });
});
