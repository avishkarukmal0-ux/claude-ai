import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Users, Loader2, RefreshCw, WifiOff, Info, AlertTriangle, ArrowLeft } from 'lucide-react';
import { getArea, fetchTileObjectURL, getRadiusProfile } from '../../lib/neighbourhoodClient';
import { NEIGHBOURHOOD_ENABLED } from '../../lib/features';
import RadiusControl from './RadiusControl';
import RadiusMap from './RadiusMap';
import RadiusFigures from './RadiusFigures';
import { fmtRadius } from '../../lib/radiusUnits';

// The catchment circle on the free card is a VISUAL guide around the shop (its own location). The figures below
// are for the shop's immediate area (LSOA) and do NOT change with the circle — radius-aggregated figures are the
// separate paid Neighbourhood Insights add-on. Bounds mirror the server's insights defaults.
const RADIUS_BOUNDS = { min: 250, max: 5000 };

// Real, official area figure for the store's postcode (Census 2021 via our backend). Shows source, date and
// the OGL attribution; works offline from the last stored copy (clearly labelled); never blocks any screen and
// never shows invented numbers. Loading tolerates a ~50s Render cold start, then falls back gracefully.
const fmtDate = (v) => { try { return new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-GB');

export default function NeighbourhoodAreaCard({ defaultPostcode = '', onBack = null }) {
  const [postcode, setPostcode] = useState(defaultPostcode);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [unit, setUnit] = useState('mi');
  const [radiusM, setRadiusM] = useState(1000);
  const [radProfile, setRadProfile] = useState(null);
  const [radState, setRadState] = useState('idle'); // idle | loading | ok | unconfigured | locked | error
  const [radHttp, setRadHttp] = useState(null);      // last radius request HTTP status (for the on-card diagnostic)

  const point = result && result.area && result.area.point;
  const radPostcode = (result && result.postcode) || postcode;

  // Radius-aggregated figures that RE-SUM as the circle moves (the paid aggregation; available on this free card
  // only when the server's INSIGHTS_TEST_UNLOCK is on — a 403 means it's locked and we hide the block). Debounced
  // so dragging the slider doesn't hammer the server. Never fabricates: configured:false → an honest note.
  useEffect(() => {
    if (!point || !radPostcode || !radPostcode.trim()) { setRadState('idle'); return undefined; }
    let live = true;
    setRadState((s) => (s === 'ok' ? 'ok' : 'loading')); // keep the last figures visible while refetching
    const id = setTimeout(async () => {
      try {
        const out = await getRadiusProfile({ postcode: radPostcode, radiusM });
        if (!live) return;
        setRadHttp(200);
        if (out && out.configured && out.profile) { setRadProfile(out.profile); setRadState('ok'); }
        else { setRadProfile(null); setRadState('unconfigured'); }
      } catch (e) {
        if (!live) return;
        setRadHttp((e && e.status) || 0);
        setRadState(e && e.status === 403 ? 'locked' : 'error');
      }
    }, 450);
    return () => { live = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusM, point && point.lat, point && point.lng, radPostcode]);

  if (!NEIGHBOURHOOD_ENABLED) return null;

  async function load(force = false) {
    if (!postcode.trim()) { toast.error('Enter your shop postcode'); return; }
    setBusy(true);
    try { setResult(await getArea(postcode.trim(), { force })); if (force) toast.success('Refreshed'); }
    finally { setBusy(false); }
  }

  return (
    <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      {onBack && (
        <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Home
        </button>
      )}
      <h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-gray-900"><MapPin className="h-4 w-4 text-primary" /> Your area — official figures</h3>
      <p className="mb-3 text-[11px] text-gray-400">A real figure for your shop’s neighbourhood from official statistics. Updates when you’re online; shows the last saved copy offline.</p>

      <div className="mb-3 flex gap-2">
        <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="Shop postcode e.g. RM10 8AA" aria-label="Shop postcode" className="flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm uppercase focus:border-primary focus:outline-none" />
        <button type="button" disabled={busy} onClick={load} className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white active:scale-95 disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {busy ? 'Loading…' : 'Get'}
        </button>
      </div>
      {busy && <p className="mb-2 text-[11px] text-gray-400">First load can take up to a minute while the server wakes…</p>}

      {result && !result.available && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-[12px] text-gray-600">
          <AlertTriangle className="mb-0.5 mr-1 inline h-3.5 w-3.5" />
          {result.unavailable ? (result.offline ? 'You’re offline and there’s no saved copy for this postcode yet.' : (result.reason || 'Area data is unavailable right now.')) : (result.reason || 'No figure for this area yet.')}
        </div>
      )}

      {result && result.available && (result.figures || []).length > 0 && (
        <div className="space-y-2">
          {result.offline && (
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700"><WifiOff className="h-3.5 w-3.5" /> Offline — last updated {fmtDate(result.stored_fetched_at || result.fetchedAt)}</div>
          )}
          {result.freshness === 'out_of_date' && !result.offline && (
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> These figures are out of date — couldn’t refresh.</div>
          )}
          <div className="flex items-center justify-between gap-2">
            {result.area && (result.area.ward || result.area.district) ? (
              <p className="text-[11px] text-gray-500">{[result.area.ward, result.area.district].filter(Boolean).join(' · ')}</p>
            ) : <span />}
            {!result.offline && (
              <button type="button" onClick={() => load(true)} disabled={busy} className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50" aria-label="Refresh the latest figures for this area">
                <RefreshCw className={`h-3 w-3 ${busy ? 'animate-spin' : ''}`} /> Refresh latest
              </button>
            )}
          </div>
          {result.area && result.area.point && !result.offline && (
            <section className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Your catchment</h4>
              <RadiusControl unit={unit} setUnit={setUnit} radiusM={radiusM} setRadiusM={setRadiusM} bounds={RADIUS_BOUNDS} />
              <div className="mt-2"><RadiusMap point={result.area.point} radiusM={radiusM} fetchTile={fetchTileObjectURL} /></div>
              <p className="mt-1 text-[10px] leading-snug text-gray-400">Map © OpenStreetMap contributors. The {fmtRadius(radiusM, unit)} circle is drawn around your shop.</p>

              <RadiusFigures state={radState} http={radHttp} profile={radProfile} radiusM={radiusM} unit={unit} />
            </section>
          )}
          {(result.figures || []).map((f) => {
            if (f.kind === 'breakdown') return <BreakdownFigure key={f.key} f={f} />;
            if (f.kind === 'imd') return <DeprivationFigure key={f.key} f={f} fallbackDate={result.fetchedAt} />;
            return <CountFigure key={f.key} f={f} fallbackDate={result.fetchedAt} />;
          })}
          <SourcesNote figures={result.figures} />
        </div>
      )}
    </div>
  );
}

// Attribution for EACH source actually shown (required by the Open Government Licence v3.0). Census figures →
// ONS; deprivation → MHCLG's English Indices of Deprivation 2025; the postcode→area lookup (and the ward/
// district labels) → the ONS Postcode Directory, which carries OS, Royal Mail and National Statistics credits.
// We no longer apply a blanket "Census 2021" label, because the deprivation (2025) and mid-year population
// figures are not from the census — each figure already shows its own reference date in its provenance line.
function SourcesNote({ figures = [] }) {
  const hasImd = figures.some((f) => f.kind === 'imd');
  const hasCensus = figures.some((f) => f.kind !== 'imd');
  return (
    <div className="mt-1 space-y-0.5 text-[10px] leading-snug text-gray-400">
      <p className="flex items-start gap-1"><Info className="mt-0.5 h-2.5 w-2.5 shrink-0" /> Official statistics, licensed under the Open Government Licence v3.0. Figures are estimates for the shop’s immediate area (LSOA).</p>
      {hasCensus && <p>Population, age, households, economic activity &amp; qualifications: Source: Office for National Statistics, Census 2021, licensed under the Open Government Licence v3.0.</p>}
      {hasImd && <p>Deprivation: English Indices of Deprivation 2025, Ministry of Housing, Communities &amp; Local Government. © Crown copyright 2025. Open Government Licence v3.0.</p>}
      <p>Area lookup uses the ONS Postcode Directory: contains OS data, Royal Mail data and National Statistics data, © Crown copyright and database right, under the Open Government Licence v3.0.</p>
    </div>
  );
}

function Provenance({ f, fallbackDate }) {
  return (
    <span className="mt-1 block text-[11px] text-gray-400">
      {f.referenceDate || 'Census 2021'} · {f.source}{f.datasetId ? ` (${f.datasetId})` : ''}{f.geographyCode ? ` · ${f.geographyCode}` : ''} · fetched {fmtDate(f.fetchedAt || fallbackDate)}{f.lastUpdated ? ` · updated ${fmtDate(f.lastUpdated)}` : ''}
    </span>
  );
}

function CountFigure({ f, fallbackDate }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
      <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><Users className="h-4 w-4" /> {f.label} (est.)</span>
      <span className="mt-1 block text-3xl font-extrabold tabular-nums text-gray-900">{fmtNum(f.value)}</span>
      <Provenance f={f} fallbackDate={fallbackDate} />
    </div>
  );
}

function DeprivationFigure({ f, fallbackDate }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
      <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><MapPin className="h-4 w-4" /> {f.label}</span>
      <span className="mt-1 block text-3xl font-extrabold tabular-nums text-gray-900">Decile {f.decile}<span className="text-base font-semibold text-gray-400"> of 10</span></span>
      <span className="mt-1 block text-[11px] text-gray-500">1 = most deprived 10% of England{f.rank != null && f.rankOf != null ? ` · rank ${fmtNum(f.rank)} of ${fmtNum(f.rankOf)}` : ''}{f.score != null ? ` · score ${f.score}` : ''}</span>
      <Provenance f={f} fallbackDate={fallbackDate} />
    </div>
  );
}

// Default visible rows for a breakdown. Complete partitions (qualifications ≈7, economic activity ≈5) show in
// full; long ones (age, ≈18 five-year bands) collapse to this with a "Show all" toggle — nothing is hidden, but
// the card stays a sensible length. (Fixes the age card getting very long after the .slice(0,6) removal, while
// qualifications/economic activity still show every category and sum to ~100%.)
const BREAKDOWN_DEFAULT_ROWS = 8;

// The first integer in a band label ("Aged 4 years and under" → 4, "5 to 9" → 5, "85 years and over" → 85),
// or null if none. Used to order the AGE breakdown as a histogram instead of by size.
const firstNumInLabel = (label) => { const m = String(label == null ? '' : label).match(/\d+/); return m ? Number(m[0]) : null; };

export function BreakdownFigure({ f }) {
  const [expanded, setExpanded] = useState(false);
  const all = f.rows || [];
  const isAge = f.key === 'age';
  // Age is read as a histogram, so show every band in AGE order (derived from the first number in each label —
  // nothing hardcoded) with no row cap. Copy before sorting (never mutate f.rows). If any label can't be parsed,
  // fall back to the given (value-sorted) order and still show all. Every other breakdown is unchanged:
  // value-sorted with the 8-row cap + "Show all" toggle.
  let ordered = all;
  if (isAge && all.length && all.every((r) => firstNumInLabel(r.label) != null)) {
    ordered = [...all].sort((a, b) => firstNumInLabel(a.label) - firstNumInLabel(b.label));
  }
  const showToggle = !isAge && all.length > BREAKDOWN_DEFAULT_ROWS;
  const rows = isAge || expanded ? ordered : ordered.slice(0, BREAKDOWN_DEFAULT_ROWS);
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{f.label} (est.)</h4>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-gray-700">{r.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-gray-900">{fmtNum(r.value)}{r.pct != null ? ` · ${r.pct}%` : ''}</span>
            </div>
            {r.pct != null && <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, r.pct)}%` }} /></div>}
          </li>
        ))}
      </ul>
      {showToggle && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 text-[11px] font-medium text-primary hover:underline">
          {expanded ? 'Show fewer' : `Show all ${all.length}`}
        </button>
      )}
      <Provenance f={f} />
    </section>
  );
}
