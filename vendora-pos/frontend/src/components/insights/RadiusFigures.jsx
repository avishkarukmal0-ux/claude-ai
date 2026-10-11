import React from 'react';
import { Loader2 } from 'lucide-react';
import { fmtRadius } from '../../lib/radiusUnits';

// Radius-aggregated figures block for the "Your area" catchment. Purely presentational — the parent owns the
// fetch + state. Every state is VISIBLE (no silent gap), and a small grey diagnostic line shows the request
// state + HTTP code so the owner can see what's happening without DevTools. The whole card is owner/manager-only
// (the /area + /radius routes are role-gated), so this line is never shown to staff.
const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-GB');

export default function RadiusFigures({ state, http, profile, radiusM, unit }) {
  return (
    <>
      {state === 'loading' && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400"><Loader2 className="h-3 w-3 animate-spin" /> Counting people in this radius…</p>
      )}
      {state === 'ok' && profile && (
        <>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-gray-50 p-2.5"><span className="block text-[10px] text-gray-400">People in {fmtRadius(radiusM, unit)} (est.)</span><span className="block text-lg font-extrabold tabular-nums text-gray-900">{fmtNum(profile.population)}</span></div>
            <div className="rounded-xl bg-gray-50 p-2.5"><span className="block text-[10px] text-gray-400">Households (est.)</span><span className="block text-lg font-extrabold tabular-nums text-gray-900">{fmtNum(profile.households)}</span></div>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-gray-400">Estimated — whole census areas whose centre is inside the circle ({fmtNum(profile.outputAreas)} areas). Re-sums as you move the radius. {profile.attribution || ''}</p>
        </>
      )}
      {state === 'unconfigured' && (
        <p className="mt-2 text-[10px] leading-snug text-amber-700">Radius figures aren’t switched on yet on the server (data provider or OA centroids) — then people/households re-sum as you move the circle.</p>
      )}
      {state === 'locked' && (
        <p className="mt-2 text-[10px] leading-snug text-gray-400">People-by-radius is the paid Neighbourhood Insights add-on. The figures below are for your immediate area (LSOA).</p>
      )}
      {state === 'error' && (
        <p className="mt-2 text-[10px] leading-snug text-gray-400">Couldn’t load the radius figures right now. The figures below are for your immediate area (LSOA).</p>
      )}
      {/* Small diagnostic (owner/manager card only). Tells us the request state without DevTools; remove/flag-gate later. */}
      <p className="mt-1 text-[9px] leading-snug text-gray-300">radius: {state}{http != null ? ` (${http})` : ''}</p>
    </>
  );
}
