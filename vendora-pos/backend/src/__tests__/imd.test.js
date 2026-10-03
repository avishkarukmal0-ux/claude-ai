'use strict';

// IMD 2025 service — DB-free: header-tolerant column mapping + row → doc (the import's core logic).
// FIXTURE headers mirror the IoD2025 File_7 wording; no DB, no network.
const imd = require('../services/imdService');

const HEADERS = [
  'LSOA code (2021)', 'LSOA name (2021)', 'Local Authority District code (2024)',
  'Index of Multiple Deprivation (IMD) Score',
  'Index of Multiple Deprivation (IMD) Rank (where 1 is most deprived)',
  'Index of Multiple Deprivation (IMD) Decile (where 1 is most deprived 10% of LSOAs)',
  'Total population: mid 2022 (excluding prisoners)',
];

describe('imdService column mapping + row parsing', () => {
  test('columnMap locates lsoa/score/rank/decile from IoD2025-style headers', () => {
    const cols = imd.columnMap(HEADERS);
    expect(cols.lsoa).toBe('LSOA code (2021)');
    expect(cols.score).toMatch(/Score/);
    expect(cols.rank).toMatch(/Rank/);
    expect(cols.decile).toMatch(/Decile/);
  });

  test('columnMap throws when essential columns are missing', () => {
    expect(() => imd.columnMap(['something', 'else'])).toThrow(/couldn.t find/i);
  });

  test('rowToDoc maps an England row (E01000036 = decile 4, rank 10,874, score 25.385)', () => {
    const cols = imd.columnMap(HEADERS);
    const row = {
      'LSOA code (2021)': 'E01000036',
      'Index of Multiple Deprivation (IMD) Score': '25.385',
      'Index of Multiple Deprivation (IMD) Rank (where 1 is most deprived)': '10,874',
      'Index of Multiple Deprivation (IMD) Decile (where 1 is most deprived 10% of LSOAs)': '4',
    };
    expect(imd.rowToDoc(row, cols)).toEqual({ lsoa21: 'E01000036', score: 25.385, rank: 10874, decile: 4 });
  });

  test('rowToDoc ignores non-England (Welsh) LSOAs', () => {
    const cols = imd.columnMap(HEADERS);
    expect(imd.rowToDoc({ 'LSOA code (2021)': 'W01000123', 'Index of Multiple Deprivation (IMD) Decile (where 1 is most deprived 10% of LSOAs)': '5' }, cols)).toBe(null);
  });
});
