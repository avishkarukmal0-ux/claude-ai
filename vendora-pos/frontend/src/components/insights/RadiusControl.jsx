import React from 'react';
import { UNITS, clamp, fmtRadius } from '../../lib/radiusUnits';

// Radius picker: a km↔mile toggle, per-unit presets, and a slider clamped to [bounds.min, bounds.max] (metres).
// Controlled — the parent owns `unit` and `radiusM`.
export default function RadiusControl({ unit, setUnit, radiusM, setRadiusM, bounds }) {
  const U = UNITS[unit];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-xs font-semibold text-gray-700">Radius — {fmtRadius(radiusM, unit)}</label>
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-[11px] font-semibold">
          {Object.keys(UNITS).map((u) => (
            <button key={u} type="button" onClick={() => setUnit(u)} className={`px-2.5 py-1 ${unit === u ? 'bg-primary text-white' : 'bg-white text-gray-600'}`}>{UNITS[u].abbr}</button>
          ))}
        </div>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        {U.presets.map((p) => {
          const m = Math.round(clamp(p * U.factor, bounds.min, bounds.max));
          const active = Math.abs(m - radiusM) < 1;
          return (
            <button key={p} type="button" onClick={() => setRadiusM(m)} className={`rounded-xl border px-3 py-1.5 text-xs font-semibold active:scale-95 ${active ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700'}`}>{p} {U.abbr}</button>
          );
        })}
      </div>
      <input
        type="range" min={bounds.min} max={bounds.max} step={Math.round(U.step * U.factor)}
        value={radiusM} onChange={(e) => setRadiusM(Number(e.target.value))}
        aria-label={`Radius in ${U.label}`} className="w-full accent-primary"
      />
      <div className="flex justify-between text-[10px] text-gray-400"><span>{fmtRadius(bounds.min, unit)}</span><span>{fmtRadius(bounds.max, unit)}</span></div>
    </div>
  );
}
