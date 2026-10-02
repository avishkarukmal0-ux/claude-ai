import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft, MapPin, Users, Home, Info, AlertTriangle, Lock, Loader2, BarChart3, Globe2,
} from 'lucide-react';
import { getStatus, getPreview, getProfile } from '../../lib/insightsClient';
import TrialsPanel from './TrialsPanel';

const RADII = [{ m: 500, label: '500 m' }, { m: 1000, label: '1 km' }, { m: 3000, label: '3 km' }];
const CAT_LABEL = { ethnicGroup: 'Ethnic group', language: 'Main language', age: 'Age band', householdComposition: 'Household composition' };

// Neighbourhood Insights (paid add-on). Aggregate ONS Census 2021 area profile around the shop, grounded in
// honest provenance: every figure is labelled estimated, with source/year/coverage/method/limitations. The
// server enforces the paid entitlement and is the only place census data is fetched.
export default function NeighbourhoodInsightsView({ onBack }) {
  const [status, setStatus] = useState(null);
  const [preview, setPreview] = useState(null);
  const [postcode, setPostcode] = useState('');
  const [radiusM, setRadiusM] = useState(1000);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const s = await getStatus();
      if (!live) return;
      setStatus(s);
      try { const p = await getPreview(); if (live) setPreview(p); } catch { /* preview optional */ }
    })();
    return () => { live = false; };
  }, []);

  async function build() {
    if (!postcode.trim()) { toast.error('Enter your shop postcode'); return; }
    setBusy(true); setResult(null);
    try {
      const out = await getProfile({ postcode: postcode.trim(), radiusM });
      setResult(out);
    } catch (e) {
      if (e.status === 402) toast.error(e.message || 'Subscription required');
      else toast.error(e.message || 'Couldn’t build the profile');
    } finally { setBusy(false); }
  }

  const entitled = status && status.entitled;

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <h2 className="mb-1 flex items-center gap-1.5 text-base font-bold text-gray-900"><Globe2 className="h-4 w-4 text-primary" /> Neighbourhood Insights</h2>
      <p className="mb-4 text-xs text-gray-400">Understand the residential area around your shop from official census data — to plan small, measurable range experiments.</p>

      {!status ? (
        <p className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : !status.enabled ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 text-center text-sm text-gray-500 shadow-sm">This add-on isn’t switched on for your shop.</div>
      ) : (
        <>
          {/* Coverage + data age — always visible (before purchase too) */}
          <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-3 text-[11px] text-gray-500 shadow-sm">
            <span className="font-semibold text-gray-700">{status.dataSource}</span> · {status.coverage} · reference year {status.referenceYear} · {status.licence}
          </div>

          {!entitled ? (
            <NotEntitled status={status} preview={preview} />
          ) : (
            <>
              {/* Location + radius */}
              <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <label className="mb-1 block text-xs font-semibold text-gray-700">Your shop postcode</label>
                <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="e.g. E1 6AN" aria-label="Shop postcode" className="mb-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm uppercase focus:border-primary focus:outline-none" />
                <label className="mb-1 block text-xs font-semibold text-gray-700">Radius</label>
                <div className="mb-3 flex gap-2">
                  {RADII.map((r) => (
                    <button key={r.m} type="button" onClick={() => setRadiusM(r.m)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold active:scale-95 ${radiusM === r.m ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700'}`}>{r.label}</button>
                  ))}
                </div>
                <button type="button" disabled={busy} onClick={build} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />} Build area profile
                </button>
              </div>

              {result && <ProfileResult result={result} />}

              {/* Phase 3 — connect the area picture to the shop's real demand (requests → trial → sales). */}
              <TrialsPanel />
            </>
          )}
        </>
      )}
    </div>
  );
}

function NotEntitled({ status, preview }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/20 bg-primary-50/40 p-4 shadow-sm">
        <div className="mb-1 flex items-center gap-1.5 text-sm font-bold text-gray-900"><Lock className="h-4 w-4 text-primary" /> A paid add-on</div>
        <p className="text-xs text-gray-600">{status.purchasingAvailable
          ? 'Subscribe to see your own area profile and run product trials.'
          : 'Purchasing isn’t available yet — this is set up by the shop owner once billing is configured. The rest of Vendora works without it.'}</p>
        {status.purchasingAvailable && (
          <button type="button" onClick={() => toast('Checkout will open here once billing is configured.', { icon: 'ℹ️' })} className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Subscribe</button>
        )}
      </div>

      {preview && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-bold text-gray-900">What you’d get</h3>
          <p className="mb-2 text-[11px] italic text-gray-400">{preview.note}</p>
          <ul className="mb-3 space-y-1">
            {(preview.shows || []).map((s) => (
              <li key={s.key} className="flex items-start gap-2 text-[12px] text-gray-700"><BarChart3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /> {s.label}</li>
            ))}
          </ul>
          <Limitations items={preview.limitations} />
          <Attribution text={preview.attribution} />
        </div>
      )}
    </div>
  );
}

function ProfileResult({ result }) {
  if (result.supported === false) {
    return <div className="rounded-2xl border border-warning/30 bg-warning-light/50 p-4 text-sm text-warning-dark"><AlertTriangle className="mb-1 h-4 w-4" /> {result.reason}</div>;
  }
  if (!result.configured) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600"><Info className="mb-1 h-4 w-4" /> {result.reason || 'Neighbourhood data isn’t configured on this server yet.'}</div>
        {result.location && <LocationCard location={result.location} />}
        {result.preview && (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-bold text-gray-900">What it will show once set up</h3>
            <ul className="space-y-1">{(result.preview.shows || []).map((s) => <li key={s.key} className="text-[12px] text-gray-700">• {s.label}</li>)}</ul>
          </div>
        )}
      </div>
    );
  }
  const p = result.profile || {};
  return (
    <div className="space-y-3">
      {result.location && <LocationCard location={result.location} />}
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-2.5 text-[11px] font-medium text-amber-800"><AlertTriangle className="mb-0.5 mr-1 inline h-3.5 w-3.5" /> Estimated — a circular radius built from {p.outputAreas} whole census areas, not exact counts.</div>
      <div className="grid grid-cols-2 gap-3">
        <Stat icon={Users} label="People nearby (est.)" value={num(p.population)} />
        <Stat icon={Home} label="Households (est.)" value={num(p.households)} />
      </div>
      {Object.entries(p.categories || {}).map(([key, rows]) => (
        <section key={key} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{CAT_LABEL[key] || key}</h3>
          <ul className="space-y-1.5">
            {(rows || []).slice(0, 8).map((r) => (
              <li key={r.label} className="text-[12px]">
                <div className="flex items-center justify-between"><span className="truncate text-gray-700">{r.label}</span><span className="shrink-0 font-semibold tabular-nums text-gray-900">{r.suppressed ? r.display : `${r.display}${r.pct != null ? ` · ${r.pct}%` : ''}`}</span></div>
                {!r.suppressed && r.pct != null && <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, r.pct)}%` }} /></div>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <Limitations items={[
        `Figures are ESTIMATES for the radius (${p.method}).`,
        'Describes nearby residents as potential customers — not your actual shoppers, and never proof of demand for a product.',
        'ONS data is disclosure-controlled; small groups are shown as “fewer than N”, not exact.',
      ]}
      />
      <Attribution text={p.attribution} extra={`${p.dataSource} · reference year ${p.referenceYear} · ${p.coverage}`} />
    </div>
  );
}

function LocationCard({ location }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 text-[12px] text-gray-600 shadow-sm">
      <div className="flex items-center gap-1.5 font-semibold text-gray-800"><MapPin className="h-3.5 w-3.5 text-primary" /> {location.postcode}{location.admin ? ` · ${location.admin}` : ''}</div>
      {location.point && <div className="mt-0.5 text-[11px] text-gray-400">Confirmed location: {Number(location.point.lat).toFixed(4)}, {Number(location.point.lng).toFixed(4)} · {location.radiusM >= 1000 ? `${location.radiusM / 1000} km` : `${location.radiusM} m`} radius</div>}
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><Icon className="h-4 w-4" /> {label}</span>
      <span className="mt-1 block text-2xl font-extrabold tabular-nums text-gray-900">{value}</span>
    </div>
  );
}

function Limitations({ items }) {
  if (!items || !items.length) return null;
  return (
    <div className="rounded-xl bg-gray-50 p-2.5">
      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400"><Info className="h-3 w-3" /> What this does &amp; doesn’t say</div>
      <ul className="space-y-0.5">{items.map((t, i) => <li key={i} className="text-[10px] leading-snug text-gray-500">• {t}</li>)}</ul>
    </div>
  );
}

function Attribution({ text, extra }) {
  if (!text) return null;
  return <p className="mt-2 text-[10px] leading-snug text-gray-400">{extra ? `${extra} — ` : ''}{text}</p>;
}

const num = (n) => (Number(n) || 0).toLocaleString('en-GB');
