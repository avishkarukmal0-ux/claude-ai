import React from 'react';
import { Loader2, Globe2 } from 'lucide-react';

// "Who lives here" — the community make-up of the catchment radius, so the owner can stock for the people nearby:
// country of birth, ethnic group and main language spoken. Purely presentational; the parent owns the fetch.
// Figures are ESTIMATES (whole census areas whose centre is inside the circle) and disclosure-controlled — a tiny
// group shows as "fewer than N", never a precise count. Never fabricates: an empty breakdown shows an honest note.
const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-GB');

const SECTIONS = [
  { key: 'countryOfBirth', label: 'Country of birth' },
  { key: 'ethnicGroup', label: 'Ethnic group' },
  { key: 'language', label: 'Main language' },
  { key: 'economicActivity', label: 'Economic activity' },
  { key: 'qualifications', label: 'Qualifications' },
];

const TOP_ROWS = 6; // keep each list short — the headline communities are what inform stocking

function Rows({ rows }) {
  const top = (rows || []).slice(0, TOP_ROWS);
  return (
    <ul className="space-y-1">
      {top.map((r) => (
        <li key={r.label} className="text-[11px]">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-gray-700">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-gray-900">{r.suppressed ? r.display : `${fmtNum(r.count)}${r.pct != null ? ` · ${r.pct}%` : ''}`}</span>
          </div>
          {!r.suppressed && r.pct != null && (
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, r.pct)}%` }} /></div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function RadiusCommunity({ state, profile }) {
  if (state === 'loading') {
    return <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400"><Loader2 className="h-3 w-3 animate-spin" /> Finding who lives in this radius…</p>;
  }
  if (state === 'error') {
    return <p className="mt-2 text-[10px] leading-snug text-gray-400">Couldn’t load the community breakdown right now — try again in a moment.</p>;
  }
  if (state === 'unconfigured') {
    return <p className="mt-2 text-[10px] leading-snug text-amber-700">Not switched on yet on the server (the census data provider or OA centroids) — once it’s set up, who-lives-here appears here.</p>;
  }
  if (state !== 'ok' || !profile) return null;
  const cats = profile.categories || {};
  const dep = profile.deprivation || null; // population-weighted IMD average across the radius (when available)
  return (
    <div className="mt-2 space-y-3">
      <p className="flex items-start gap-1 text-[10px] leading-snug text-gray-400"><Globe2 className="mt-0.5 h-3 w-3 shrink-0" /> Estimated make-up of the people in this radius (whole census areas inside the circle), to help you stock for your community. Small groups show as “fewer than N”.</p>
      {dep && dep.decile != null && (
        <div className="rounded-xl bg-gray-50 p-2.5">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">Deprivation across this radius</span>
          <span className="mt-0.5 block text-lg font-extrabold tabular-nums text-gray-900">Decile {dep.decile}<span className="text-xs font-semibold text-gray-400"> of 10</span></span>
          <span className="block text-[10px] leading-snug text-gray-400">1 = most deprived 10% of England · population-weighted average over {dep.lsoaCount} area{dep.lsoaCount === 1 ? '' : 's'}{dep.score != null ? ` · avg score ${dep.score}` : ''} (estimate).</span>
        </div>
      )}
      {SECTIONS.map(({ key, label }) => {
        const rows = (cats[key] || []).filter((r) => (r.count || 0) > 0 || r.suppressed);
        return (
          <section key={key}>
            <h5 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</h5>
            {rows.length ? <Rows rows={rows} /> : (
              <p className="text-[10px] leading-snug text-amber-700">
                {key === 'countryOfBirth'
                  ? 'Country of birth isn’t available yet — its census dataset needs verifying on the server.'
                  : 'No data for this breakdown in this area.'}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
