import React, { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Users, Loader2, RefreshCw, WifiOff, Info, AlertTriangle, ArrowLeft, Globe2, ChevronDown } from 'lucide-react';
import { getArea, fetchTileObjectURL, getRadiusProfile } from '../../lib/neighbourhoodClient';
import { NEIGHBOURHOOD_ENABLED } from '../../lib/features';
import RadiusControl from './RadiusControl';
import RadiusMap from './RadiusMap';
import RadiusFigures from './RadiusFigures';
import RadiusCommunity from './RadiusCommunity';
import { fmtRadius, clamp } from '../../lib/radiusUnits';

// The catchment circle on the free card is a VISUAL guide around the shop (its own location). The figures below
// are for the shop's immediate area (LSOA) and do NOT change with the circle — radius-aggregated figures are the
// separate paid Neighbourhood Insights add-on. Bounds mirror the server's insights defaults.
const RADIUS_BOUNDS = { min: 250, max: 5000 };
// In map-zoom mode the viewport radius is snapped to this step so zooming lands on a small set of radii (good
// cache reuse → snappy). Coarser = fewer slow fetches; finer = smoother steps. 250 m is a good balance for an est.
const RADIUS_STEP_M = 250;

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
  const [radiusMode, setRadiusMode] = useState('map'); // 'slider' | 'map' — map: the radius follows the map zoom
  const [radProfile, setRadProfile] = useState(null);
  const [radState, setRadState] = useState('idle'); // idle | loading | ok | unconfigured | locked | error
  const [radHttp, setRadHttp] = useState(null);      // last radius request HTTP status (for the on-card diagnostic)
  const [radDiag, setRadDiag] = useState(null);      // server diagnostic: how many OAs actually returned census data
  const [whoOpen, setWhoOpen] = useState(false);     // "Who lives here" community breakdown — loaded on demand
  const [whoProfile, setWhoProfile] = useState(null);
  const [whoState, setWhoState] = useState('idle');  // idle | loading | ok | error
  const [radFetching, setRadFetching] = useState(false); // F8: a new radius/postcode fetch is in flight over stale figures

  const point = result && result.area && result.area.point;
  const radPostcode = (result && result.postcode) || postcode;
  const prevRadPostcode = useRef(radPostcode); // F8: detect a postcode change so stale figures aren't shown for it
  const radCache = useRef(new Map()); // `${postcode}:${radiusM}` → { state, profile, http, diag } — instant on revisit
  const whoCache = useRef(new Map()); // `${postcode}:${radiusM}` → full profile (community breakdowns) — revisit = instant

  // Map-zoom ("manual") mode: the map reports the radius that fits the current viewport. Quantise to a coarse STEP
  // so zooming lands on a small ladder of radii (250 m, 500 m, …) — far fewer distinct values means most zoom stops
  // are a cache hit (instant) instead of a fresh, slow census fetch, which is what made counting feel laggy. Clamp
  // to the allowed bounds, and skip no-op updates so the figures only re-sum when the radius actually changes step.
  const onViewRadius = useCallback((m) => {
    const q = clamp(Math.round(m / RADIUS_STEP_M) * RADIUS_STEP_M, RADIUS_BOUNDS.min, RADIUS_BOUNDS.max);
    setRadiusM((prev) => (q !== prev ? q : prev));
  }, []);

  // Radius-aggregated figures that RE-SUM as the circle moves (the paid aggregation; available on this free card
  // only when the server's INSIGHTS_TEST_UNLOCK is on — a 403 means it's locked and we hide the block). The server
  // call (postcode → OAs in radius → Nomis) is slow on a first visit to each radius, so we: (a) serve a cached
  // outcome for a radius already fetched this session (instant), and (b) debounce new radii so dragging the slider
  // doesn't fire a request per step. Never fabricates: configured:false → an honest note.
  useEffect(() => {
    if (!point || !radPostcode || !radPostcode.trim()) { setRadState('idle'); return undefined; }
    // F8 (round 2): if the POSTCODE changed, clear the old area's figures immediately — never show one area's
    // numbers under another's name while the new fetch is in flight.
    const postcodeChanged = prevRadPostcode.current !== radPostcode;
    prevRadPostcode.current = radPostcode;
    if (postcodeChanged) { setRadProfile(null); setRadState('loading'); }
    const key = `${radPostcode}:${Math.round(radiusM)}`;
    const hit = radCache.current.get(key);
    if (hit) { // instant — no round-trip
      setRadProfile(hit.profile); setRadState(hit.state); setRadHttp(hit.http); setRadDiag(hit.diag); setRadFetching(false);
      return undefined;
    }
    let live = true;
    // Keep the last figures visible while fetching a NEW radius for the SAME postcode, but mark them as updating
    // (F8) so the user knows they're for the previous view until the new ones land.
    setRadState((s) => (s === 'ok' && !postcodeChanged ? 'ok' : 'loading'));
    setRadFetching(true);
    const id = setTimeout(async () => {
      try {
        const out = await getRadiusProfile({ postcode: radPostcode, radiusM });
        if (!live) return;
        setRadFetching(false);
        const diag = out && out.diag ? out.diag : null;
        setRadHttp(200); setRadDiag(diag);
        if (out && out.configured && out.profile) { setRadProfile(out.profile); setRadState('ok'); radCache.current.set(key, { state: 'ok', profile: out.profile, http: 200, diag }); }
        else { setRadProfile(null); setRadState('unconfigured'); radCache.current.set(key, { state: 'unconfigured', profile: null, http: 200, diag }); }
      } catch (e) {
        if (!live) return;
        setRadFetching(false);
        const code = (e && e.status) || 0;
        setRadHttp(code); setRadState(code === 403 ? 'locked' : 'error');
        // cache a 403 (stable config) but not transient errors, so a real outage retries next time.
        if (code === 403) radCache.current.set(key, { state: 'locked', profile: null, http: 403, diag: null });
      }
      // Map-zoom settles on a discrete step (one zoomend), so it doesn't need the long slider-drag debounce —
      // respond sooner. Slider mode keeps the longer debounce so dragging doesn't fire a request per step.
    }, radiusMode === 'map' ? 300 : 650);
    return () => { live = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radiusM, point && point.lat, point && point.lng, radPostcode, radiusMode]);

  // "Who lives here" community breakdown (country of birth, ethnic group, main language) — fetched on demand when
  // the owner opens the section (not while locked/idle). It asks the server for the FULL profile (full=1), which
  // costs the extra census tables — hence on demand, so the headline stays fast. Cached per {postcode, radius} for
  // the session; re-fetches when the radius changes while open. Honest states: unconfigured → a note, not an error.
  useEffect(() => {
    if (!whoOpen || !point || !radPostcode || !radPostcode.trim() || radState === 'locked' || radState === 'idle') return undefined;
    const key = `${radPostcode}:${Math.round(radiusM)}`;
    const hit = whoCache.current.get(key);
    if (hit) { setWhoProfile(hit); setWhoState('ok'); return undefined; }
    let live = true;
    setWhoState((s) => (s === 'ok' ? 'ok' : 'loading'));
    const id = setTimeout(async () => {
      try {
        const out = await getRadiusProfile({ postcode: radPostcode, radiusM, full: true });
        if (!live) return;
        if (out && out.configured && out.profile) { setWhoProfile(out.profile); setWhoState('ok'); whoCache.current.set(key, out.profile); }
        else { setWhoProfile(null); setWhoState('unconfigured'); }
      } catch (e) {
        if (!live) return;
        const code = (e && e.status) || 0;
        setWhoProfile(null); setWhoState(code === 403 ? 'locked' : 'error');
      }
    }, 400);
    return () => { live = false; clearTimeout(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whoOpen, radState, radiusM, point && point.lat, point && point.lng, radPostcode]);

  if (!NEIGHBOURHOOD_ENABLED) return null;

  async function load(force = false) {
    if (!postcode.trim()) { toast.error('Enter your shop postcode'); return; }
    setBusy(true);
    try {
      const res = await getArea(postcode.trim(), { force });
      setResult(res);
      // Audit F9 (round 2): only announce "Refreshed" when we actually got FRESH online data. Previously an
      // explicit refresh toasted "Refreshed" even when the result was unavailable, offline or a stale fallback.
      if (force) {
        const fresh = res && res.available && !res.offline && res.freshness !== 'out_of_date';
        if (fresh) toast.success('Refreshed');
        else if (res && res.offline) toast.error('Still offline — showing the last saved copy');
        else toast.error((res && res.reason) || 'Couldn’t refresh — area data is unavailable right now');
      }
    } finally { setBusy(false); }
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
        <button type="button" disabled={busy} onClick={() => load()} className="flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white active:scale-95 disabled:opacity-50">
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
              <RadiusControl unit={unit} setUnit={setUnit} radiusM={radiusM} setRadiusM={setRadiusM} bounds={RADIUS_BOUNDS} mode={radiusMode} setMode={setRadiusMode} />
              <div className="mt-2"><RadiusMap point={result.area.point} radiusM={radiusM} fetchTile={fetchTileObjectURL} followView={radiusMode === 'map'} onViewRadius={onViewRadius} /></div>
              <p className="mt-1 text-[10px] leading-snug text-gray-400">Map © OpenStreetMap contributors. The {fmtRadius(radiusM, unit)} circle is drawn around your shop.</p>

              {radFetching && radProfile && (
                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-gray-400" aria-live="polite">
                  <Loader2 className="h-3 w-3 animate-spin" /> Updating for the new view — figures below are for the previous radius.
                </div>
              )}
              <RadiusFigures state={radState} http={radHttp} diag={radDiag} profile={radProfile} radiusM={radiusM} unit={unit} />

              {/* On-demand "Who lives here" — country of birth, ethnic group, main language — so the owner can stock
                  for the local community. Shown whenever the radius feature is available (hidden only when the data
                  is locked to the paid add-on, or before a postcode is entered); opening it loads the breakdowns. */}
              {radState !== 'locked' && radState !== 'idle' && (
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <button type="button" onClick={() => setWhoOpen((v) => !v)} aria-expanded={whoOpen} className="flex w-full items-center justify-between text-left text-[12px] font-semibold text-primary">
                    <span className="flex items-center gap-1.5"><Globe2 className="h-3.5 w-3.5" /> Who lives here — stock for your community</span>
                    <ChevronDown className={`h-4 w-4 transition-transform ${whoOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {whoOpen && <RadiusCommunity state={whoState} profile={whoProfile} />}
                </div>
              )}
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
