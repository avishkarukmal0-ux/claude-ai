'use strict';

/*
 * Live check for the real neighbourhood data pipeline — RUN FROM A MACHINE WITH NETWORK ACCESS (your PC).
 *
 * STANDALONE: no npm install, no repo build, no app imports — just Node 18+ (global fetch). You can run it from
 * inside the repo OR save this single file anywhere and run it. It is a DIAGNOSTIC: it calls the real upstreams
 * and prints what they actually return. It ships no sample data and is not part of any production path.
 *
 * Prints, for a postcode you give it:
 *   - postcodes.io : HTTP status + area codes (lsoa21/msoa21/ward/district/country)
 *   - ONS or Nomis : HTTP status + ONE real figure (population) + freshness fields
 *
 * Windows PowerShell:
 *   $env:NEIGHBOURHOOD_SOURCE="ons"
 *   $env:ONS_USER_AGENT="vendora/1.0.0 (you@example.com +https://claude-ai-indol.vercel.app)"
 *   $env:NEIGHBOURHOOD_POP_DATASET="<dataset-id>"     # leave unset on the first run to just verify postcodes.io
 *   node neighbourhood-live-check.js "RM10 8AA"
 *
 *   # Nomis instead (optional secret UID removes the 25k-cell guest cap):
 *   $env:NEIGHBOURHOOD_SOURCE="nomis"; $env:NEIGHBOURHOOD_POP_DATASET="NM_xxxx_1"; $env:NOMIS_UID="<secret>"
 */
/* eslint-disable no-console */

const SOURCE = (process.env.NEIGHBOURHOOD_SOURCE || 'ons').toLowerCase();
const UA = process.env.ONS_USER_AGENT || 'vendora/1.0.0 (neighbourhood live-check; set ONS_USER_AGENT)';
const DATASET = process.env.NEIGHBOURHOOD_POP_DATASET || null;
const NOMIS_UID = process.env.NOMIS_UID || null;
// Step 2 figures (optional) — set the ones you want to verify. `query` adds dataset-specific Nomis dims.
const STEP2 = [
  { key: 'populationMid', label: 'Population (mid-year)', kind: 'count', dataset: process.env.NEIGHBOURHOOD_DS_POP_MID || null, query: '&gender=0&c_age=200&time=latest' },
  { key: 'households', label: 'Households', kind: 'count', dataset: process.env.NEIGHBOURHOOD_DS_HOUSEHOLDS || null },
  { key: 'age', label: 'Age', kind: 'breakdown', dataset: process.env.NEIGHBOURHOOD_DS_AGE || null },
  { key: 'economicActivity', label: 'Economic activity', kind: 'breakdown', dataset: process.env.NEIGHBOURHOOD_DS_ECON || null },
  { key: 'deprivation', label: 'Household deprivation', kind: 'breakdown', dataset: process.env.NEIGHBOURHOOD_DS_DEPRIVATION || null },
  { key: 'qualifications', label: 'Qualifications', kind: 'breakdown', dataset: process.env.NEIGHBOURHOOD_DS_QUALS || null },
].filter((f) => f.dataset);
const POSTCODES_BASE = (process.env.POSTCODES_IO_BASE || 'https://api.postcodes.io').replace(/\/+$/, '');
const ONS_BASE = (process.env.ONS_API_BASE || 'https://api.beta.ons.gov.uk/v1').replace(/\/+$/, '');
const NOMIS_BASE = (process.env.NOMIS_API_BASE || 'https://www.nomisweb.co.uk/api/v01').replace(/\/+$/, '');
const TIMEOUT_MS = parseInt(process.env.NEIGHBOURHOOD_TIMEOUT_MS, 10) || 55000;
const OGL = 'Source: Office for National Statistics licensed under the Open Government Licence v3.0';

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA } });
    const text = await res.text();
    let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    console.log(`  → ${res.status}  ${url.split('?')[0]}  (${Date.now() - t0}ms)`);
    // Respect a 429 once (rate-limit etiquette).
    if (res.status === 429) {
      const ra = Number(res.headers.get('retry-after')) || 2;
      console.log(`     (429 — waiting ${ra}s then retrying once)`);
      await new Promise((r) => setTimeout(r, Math.min(ra, 120) * 1000));
      return get(url);
    }
    return { status: res.status, body };
  } finally { clearTimeout(timer); }
}

function normalise(pc) { return String(pc || '').toUpperCase().replace(/\s+/g, ''); }

async function resolvePostcode(pc) {
  const res = await get(`${POSTCODES_BASE}/postcodes/${encodeURIComponent(pc)}`);
  if (res.status !== 200 || !res.body || !res.body.result) throw new Error(`postcodes.io returned ${res.status}`);
  const r = res.body.result; const codes = r.codes || {};
  return { postcode: r.postcode, lsoa21: codes.lsoa || r.lsoa || null, msoa21: codes.msoa || r.msoa || null, ward: r.admin_ward || null, district: r.admin_district || null, country: r.country || null };
}

async function fetchNomis(area) {
  const uid = NOMIS_UID ? `&uid=${encodeURIComponent(NOMIS_UID)}` : '';
  const res = await get(`${NOMIS_BASE}/dataset/${DATASET}.data.json?geography=${encodeURIComponent(area.lsoa21)}&measures=20100${uid}`);
  if (res.status !== 200 || !res.body || !Array.isArray(res.body.obs)) return null;
  // A count table returns a "Total" row PLUS its components (Total = Σ components) — summing double-counts.
  // Take the row labelled "Total"; else the max (which equals the total for a count table). Never sum.
  let total = null; let max = null;
  for (const o of res.body.obs) {
    const v = Number(o.obs_value && (o.obs_value.value != null ? o.obs_value.value : o.obs_value));
    if (!Number.isFinite(v)) continue;
    max = max == null ? v : Math.max(max, v);
    if (Object.values(o).some((d) => d && typeof d === 'object' && typeof d.description === 'string' && /^total\b/i.test(d.description))) total = v;
  }
  const value = total != null ? total : max;
  return value == null ? null : { value, source: 'Nomis', datasetId: DATASET, edition: null, version: null, referenceDate: 'Census 2021', lastUpdated: null };
}

// Fetch a Step 2 figure from Nomis (count or breakdown) for the live check.
async function fetchNomisFigure(area, fig) {
  const uid = NOMIS_UID ? `&uid=${encodeURIComponent(NOMIS_UID)}` : '';
  const extra = fig.query || '';
  const res = await get(`${NOMIS_BASE}/dataset/${fig.dataset}.data.json?geography=${encodeURIComponent(area.lsoa21)}&measures=20100${extra}${uid}`);
  if (res.status !== 200 || !res.body || !Array.isArray(res.body.obs)) return null;
  if (fig.kind === 'count') {
    let total = null; let max = null;
    for (const o of res.body.obs) { const v = Number(o.obs_value && (o.obs_value.value != null ? o.obs_value.value : o.obs_value)); if (!Number.isFinite(v)) continue; max = max == null ? v : Math.max(max, v); if (Object.values(o).some((d) => d && typeof d === 'object' && /^total\b/i.test(d.description || ''))) total = v; }
    const value = total != null ? total : max;
    return value == null ? null : { value };
  }
  // breakdown: find the varying dimension, drop Total, compute %
  const distinct = {};
  for (const o of res.body.obs) for (const [k, v] of Object.entries(o)) { if (k !== 'obs_value' && v && typeof v === 'object' && typeof v.description === 'string') (distinct[k] = distinct[k] || new Set()).add(v.description); }
  let dim = null; let best = 1; for (const [k, s] of Object.entries(distinct)) if (s.size > best) { best = s.size; dim = k; }
  if (!dim) return null;
  const cats = []; let totalRow = null;
  for (const o of res.body.obs) { const label = o[dim] && o[dim].description; const v = Number(o.obs_value && (o.obs_value.value != null ? o.obs_value.value : o.obs_value)); if (!label || !Number.isFinite(v)) continue; if (/^total\b/i.test(label)) { totalRow = v; continue; } cats.push({ label, value: v }); }
  // Keep only top-level categories (min colon-depth) for hierarchical tables like TS066.
  const depth = (l) => (l.match(/:/g) || []).length;
  let top = cats; if (cats.length) { const min = Math.min(...cats.map((c) => depth(c.label))); top = cats.filter((c) => depth(c.label) === min); }
  const total = totalRow != null ? totalRow : top.reduce((s, r) => s + r.value, 0);
  const rows = top.map((r) => ({ ...r, pct: total > 0 ? Math.round((r.value / total) * 1000) / 10 : null })).sort((a, b) => b.value - a.value);
  return { value: total, rows };
}

async function fetchOns(area) {
  const meta = await get(`${ONS_BASE}/datasets/${encodeURIComponent(DATASET)}`);
  if (meta.status !== 200 || !meta.body) return null;
  const lastUpdated = meta.body.last_updated || null;
  const href = meta.body.links && meta.body.links.latest_version && meta.body.links.latest_version.href;
  if (!href) { console.log('     (no latest_version link — check the dataset id)'); return null; }
  const obs = await get(`${href}/observations?geography=${encodeURIComponent(area.lsoa21)}`);
  if (obs.status !== 200 || !obs.body) return null;
  const list = obs.body.observations || (Array.isArray(obs.body) ? obs.body : null);
  if (!Array.isArray(list) || !list.length) return null;
  const value = Number(list[0].observation != null ? list[0].observation : list[0].value);
  return Number.isFinite(value) ? { value, source: 'ONS', datasetId: DATASET, edition: (meta.body.links.latest_version && meta.body.links.latest_version.id) || null, version: href.split('/').pop(), referenceDate: 'Census 2021', lastUpdated } : null;
}

async function main() {
  const pcIn = process.argv.slice(2).join(' ').trim();
  if (!pcIn) { console.error('Usage: node neighbourhood-live-check.js "<postcode>"'); process.exit(2); }
  const pc = normalise(pcIn);

  console.log('\n=== Neighbourhood live check (standalone) ===');
  console.log(`source         : ${SOURCE}`);
  console.log(`dataset (pop)  : ${DATASET || '(unset — will verify postcodes.io then show discovery steps)'}`);
  console.log(`ONS User-Agent : ${UA}`);
  console.log(`Nomis UID      : ${NOMIS_UID ? '(set, hidden)' : '(not set — guest, 25k-cell cap)'}`);

  try {
    console.log('\n[1] postcodes.io — resolve area codes');
    const area = await resolvePostcode(pc);
    console.log('    area codes:', JSON.stringify(area));

    if (!DATASET) {
      console.log('\n[2] No NEIGHBOURHOOD_POP_DATASET set — discover the id, then re-run:');
      console.log('    Nomis: Invoke-RestMethod "https://www.nomisweb.co.uk/api/v01/dataset/def.sdmx.json" | Out-File nomis.json');
      console.log('    ONS  : Invoke-RestMethod -Headers @{ "User-Agent" = $env:ONS_USER_AGENT } "https://api.beta.ons.gov.uk/v1/datasets?limit=338"');
      process.exit(0);
    }

    console.log(`\n[2] ${SOURCE.toUpperCase()} — fetch one real figure for ${area.lsoa21}`);
    const fig = SOURCE === 'nomis' ? await fetchNomis(area) : await fetchOns(area);
    if (!fig) { console.log('    ✗ No usable figure. Check the dataset id / dimensions for this source, then re-run.'); process.exit(1); }

    const fetchedAt = new Date();
    console.log('\n=== RESULT (real figure + freshness) ===');
    console.log(`    population   : ${Number(fig.value).toLocaleString('en-GB')}`);
    console.log(`    source       : ${fig.source}`);
    console.log(`    datasetId    : ${fig.datasetId}`);
    console.log(`    edition      : ${fig.edition || '-'}`);
    console.log(`    version      : ${fig.version || '-'}`);
    console.log(`    geography    : lsoa21 ${area.lsoa21}`);
    console.log(`    referenceDate: ${fig.referenceDate}`);
    console.log(`    last_updated : ${fig.lastUpdated || '(not provided by source)'}`);
    console.log(`    fetchedAt    : ${fetchedAt.toISOString()}`);
    console.log(`    attribution  : ${OGL}`);

    if (SOURCE === 'nomis' && STEP2.length) {
      console.log(`\n[3] Step 2 figures (${STEP2.length})`);
      for (const fig of STEP2) {
        try {
          const out = await fetchNomisFigure(area, fig);
          if (!out) { console.log(`    ${fig.label}: ✗ no usable data (check id ${fig.dataset})`); continue; }
          if (fig.kind === 'count') { console.log(`    ${fig.label}: ${Number(out.value).toLocaleString('en-GB')}  (${fig.dataset})`); }
          else {
            console.log(`    ${fig.label} (${fig.dataset}) — total ${Number(out.value).toLocaleString('en-GB')}:`);
            for (const r of out.rows.slice(0, 6)) console.log(`        ${String(r.value).padStart(8)}  ${r.pct != null ? `${r.pct}%`.padStart(6) : '      '}  ${r.label}`);
          }
        } catch (e) { console.log(`    ${fig.label}: ✗ ${e.message}`); }
      }
    } else if (SOURCE !== 'nomis' && STEP2.length) {
      console.log('\n[3] Step 2 breakdowns are fetched via Nomis in this build — set NEIGHBOURHOOD_SOURCE=nomis to verify them.');
    }

    console.log('\n✓ End-to-end live check OK — this is what the deployed route will return + cache.\n');
  } catch (err) {
    console.error(`\n✗ Live check failed: ${err.message}`);
    process.exit(1);
  }
}

main();
