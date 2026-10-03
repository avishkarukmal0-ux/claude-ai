'use strict';

// English Indices of Deprivation 2025 — lookup + a pure, header-tolerant row mapper (unit-tested offline).
// Data is imported once (scripts/import-imd.js) into the ImdArea collection; this service just reads it and
// shapes a deprivation figure. England only — a non-England LSOA returns null (caller shows "not covered").
const ImdArea = require('../models/ImdArea');

const OGL_IMD = 'Source: English indices of deprivation 2025 (Ministry of Housing, Communities & Local Government), licensed under the Open Government Licence v3.0';

/** Find a header whose name contains ALL the given needles (case-insensitive). Returns the exact key or null. */
function findHeader(headers, needles) {
  const lower = headers.map((h) => ({ h, l: String(h).toLowerCase() }));
  const hit = lower.find(({ l }) => needles.every((n) => l.includes(n)));
  return hit ? hit.h : null;
}

/**
 * Build a column map from the CSV header row, tolerating the IoD2025 header wording. Returns
 * { lsoa, score, rank, decile } header names, or throws if the essential columns aren't found.
 */
function columnMap(headers) {
  const lsoa = findHeader(headers, ['lsoa', 'code']);
  const score = findHeader(headers, ['imd', 'score']);
  const rank = findHeader(headers, ['imd', 'rank']);
  const decile = findHeader(headers, ['imd', 'decile']);
  if (!lsoa || !decile) throw new Error(`IMD CSV: couldn't find the LSOA-code and IMD-decile columns (got lsoa=${lsoa}, decile=${decile})`);
  return { lsoa, score, rank, decile };
}

/** Map one parsed CSV row (object keyed by header) to an ImdArea doc via the column map. null if no LSOA. */
function rowToDoc(row, cols) {
  const lsoa21 = String(row[cols.lsoa] || '').trim();
  if (!/^E\d{8}$/i.test(lsoa21)) return null; // England LSOA21 codes only
  const num = (v) => { const n = Number(String(v == null ? '' : v).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
  return {
    lsoa21: lsoa21.toUpperCase(),
    score: cols.score ? num(row[cols.score]) : null,
    rank: cols.rank ? num(row[cols.rank]) : null,
    decile: num(row[cols.decile]),
  };
}

/** Deprivation figure for an LSOA (England only). null when not imported / not England. */
async function getFigure(lsoa21) {
  if (!lsoa21 || !/^E\d{8}$/i.test(lsoa21)) return null; // Wales (W…) / unknown → not covered
  const rec = await ImdArea.findOne({ lsoa21: lsoa21.toUpperCase() }).lean();
  if (!rec || rec.decile == null) return null;
  return {
    key: 'deprivation', label: 'Deprivation (IMD 2025)', kind: 'imd',
    value: rec.decile, decile: rec.decile, rank: rec.rank, rankOf: rec.rankOf || null, score: rec.score,
    geography: 'lsoa21', geographyCode: lsoa21.toUpperCase(),
    source: rec.source || 'English indices of deprivation 2025', datasetId: 'IoD2025',
    referenceDate: rec.referenceDate || 'IMD 2025 (30 Oct 2025)', lastUpdated: null, attribution: OGL_IMD,
  };
}

async function isLoaded() { try { return (await ImdArea.estimatedDocumentCount()) > 0; } catch { return false; } }

module.exports = { getFigure, isLoaded, columnMap, rowToDoc, findHeader, OGL_IMD };
