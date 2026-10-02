import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin, Users, Loader2, RefreshCw, WifiOff, Info, AlertTriangle } from 'lucide-react';
import { getArea } from '../../lib/neighbourhoodClient';
import { NEIGHBOURHOOD_ENABLED } from '../../lib/features';

// Real, official area figure for the store's postcode (Census 2021 via our backend). Shows source, date and
// the OGL attribution; works offline from the last stored copy (clearly labelled); never blocks any screen and
// never shows invented numbers. Loading tolerates a ~50s Render cold start, then falls back gracefully.
const fmtDate = (v) => { try { return new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-GB');

export default function NeighbourhoodAreaCard({ defaultPostcode = '' }) {
  const [postcode, setPostcode] = useState(defaultPostcode);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  if (!NEIGHBOURHOOD_ENABLED) return null;

  async function load() {
    if (!postcode.trim()) { toast.error('Enter your shop postcode'); return; }
    setBusy(true);
    try { setResult(await getArea(postcode.trim())); }
    finally { setBusy(false); }
  }

  const pop = result && (result.figures || []).find((f) => f.key === 'population');

  return (
    <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
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

      {result && result.available && pop && (
        <div className="space-y-2">
          {result.offline && (
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700"><WifiOff className="h-3.5 w-3.5" /> Offline — last updated {fmtDate(result.stored_fetched_at || result.fetchedAt)}</div>
          )}
          {result.freshness === 'out_of_date' && !result.offline && (
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /> This figure is out of date — couldn’t refresh.</div>
          )}
          <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><Users className="h-4 w-4" /> {pop.label || 'Usual residents'} {result.area && result.area.ward ? `· ${result.area.ward}` : ''}</span>
            <span className="mt-1 block text-3xl font-extrabold tabular-nums text-gray-900">{fmtNum(pop.value)}</span>
            <span className="mt-1 block text-[11px] text-gray-500">{pop.referenceDate || 'Census 2021'} · {pop.source}{pop.datasetId ? ` (${pop.datasetId})` : ''}{pop.geographyCode ? ` · ${pop.geographyCode}` : ''}</span>
            <span className="mt-0.5 block text-[11px] text-gray-400">Fetched {fmtDate(pop.fetchedAt || result.fetchedAt)}{pop.lastUpdated ? ` · dataset updated ${fmtDate(pop.lastUpdated)}` : ''}</span>
          </div>
          <p className="flex items-start gap-1 text-[10px] leading-snug text-gray-400"><Info className="mt-0.5 h-2.5 w-2.5 shrink-0" /> {pop.attribution || result.attribution}</p>
        </div>
      )}
    </div>
  );
}
