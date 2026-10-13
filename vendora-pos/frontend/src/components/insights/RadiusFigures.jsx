import React from 'react';
import { Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { fmtRadius } from '../../lib/radiusUnits';

// Radius-aggregated figures block for the "Your area" catchment. Purely presentational — the parent owns the
// fetch + state. Every state is VISIBLE (no silent gap), and a small grey diagnostic line shows the request
// state + HTTP code so the owner can see what's happening without DevTools. The whole card is owner/manager-only
// (the /area + /radius routes are role-gated), so this line is never shown to staff.
const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-GB');

export default function RadiusFigures({ state, http, diag, profile, radiusM, unit, onRetry, savedAt = null }) {
  const fmtSaved = (v) => { try { return new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };
  const cached = state === 'cached';
  return (
    <>
      {state === 'loading' && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-400"><Loader2 className="h-3 w-3 animate-spin" /> Counting people in this radius…</p>
      )}
      {cached && profile && (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700"><WifiOff className="h-3.5 w-3.5" /> Showing your last saved catchment{savedAt ? ` from ${fmtSaved(savedAt)}` : ''}</div>
      )}
      {(state === 'ok' || cached) && profile && (
        <>
          {/* Label with the radius these figures were actually computed for (profile.radiusM), so a just-changed
              radius never mislabels the previous result while the new one is still loading (audit F8). */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-gray-50 p-2.5"><span className="block text-xs text-gray-400">People in {fmtRadius(profile.radiusM != null ? profile.radiusM : radiusM, unit)} (est.)</span><span className="block text-lg font-extrabold tabular-nums text-gray-900">{fmtNum(profile.population)}</span></div>
            <div className="rounded-xl bg-gray-50 p-2.5"><span className="block text-xs text-gray-400">Households (est.)</span><span className="block text-lg font-extrabold tabular-nums text-gray-900">{fmtNum(profile.households)}</span></div>
          </div>
          <p className="mt-1 text-xs leading-snug text-gray-400">Estimated — whole census areas whose centre is inside the circle ({fmtNum(profile.outputAreas)} areas). {cached ? 'Saved copy — reconnect to update as you move the radius.' : 'Re-sums as you move the radius.'} {profile.attribution || ''}</p>
        </>
      )}
      {state === 'unconfigured' && (
        <p className="mt-2 text-xs leading-snug text-amber-700">Radius figures aren’t switched on yet on the server (data provider or OA centroids) — then people/households re-sum as you move the circle.</p>
      )}
      {state === 'locked' && (
        <p className="mt-2 text-xs leading-snug text-gray-400">People-by-radius is the paid Neighbourhood Insights add-on. The figures below are for your immediate area (LSOA).</p>
      )}
      {state === 'timeout' && (
        <div className="mt-2 flex flex-wrap items-center gap-2" role="alert">
          <span className="text-xs leading-snug text-gray-600">Couldn’t count people in this radius.</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-white active:scale-95">
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          )}
        </div>
      )}
      {state === 'error' && (
        <p className="mt-2 text-xs leading-snug text-gray-400">Couldn’t load the radius figures right now. The figures below are for your immediate area (LSOA).</p>
      )}
      {/* Small diagnostic (owner/manager card only). Tells us the request state + whether Nomis actually returned
          data for the OAs (oasWithPopulation/oaCount) without DevTools. Remove/flag-gate later. */}
      <p className="mt-1 text-xs leading-snug text-gray-300">
        radius: {state}{http != null ? ` (${http})` : ''}
        {diag ? ` · ${diag.oasWithPopulation}/${diag.oaCount} OA w/ data · sample ${diag.sampleOa || '—'} age:${diag.sampleAgeCats} hh:${diag.sampleHhCats}` : ''}
      </p>
    </>
  );
}
