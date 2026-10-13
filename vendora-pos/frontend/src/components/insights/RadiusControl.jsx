import React from 'react';
import { UNITS, clamp, fmtRadius } from '../../lib/radiusUnits';

// Radius picker: a km↔mile toggle, per-unit presets, and a slider clamped to [bounds.min, bounds.max] (metres).
// Controlled — the parent owns `unit` and `radiusM`.
//
// Optional "manual mode" toggle (only shown when the parent passes `setMode`): the radius can be set either with
// the slider ('slider') or by zooming the map in and out ('map' — the parent drives `radiusM` from the map view).
// In 'map' mode the slider/presets are hidden (the map is the control) and a short hint explains it.
export default function RadiusControl({ unit, setUnit, radiusM, setRadiusM, bounds, mode = 'slider', setMode = null }) {
  const U = UNITS[unit];
  const mapMode = mode === 'map';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-xs font-semibold text-gray-700">Radius — {fmtRadius(radiusM, unit)}</label>
        <div className="flex items-center gap-2">
          {setMode && (
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-xs font-semibold" role="group" aria-label="How to set the radius">
              <button type="button" aria-pressed={!mapMode} onClick={() => setMode('slider')} className={`inline-flex min-h-[44px] items-center px-3 ${!mapMode ? 'bg-primary text-white' : 'bg-white text-gray-600'}`}>Slider</button>
              <button type="button" aria-pressed={mapMode} onClick={() => setMode('map')} className={`inline-flex min-h-[44px] items-center px-3 ${mapMode ? 'bg-primary text-white' : 'bg-white text-gray-600'}`}>Map zoom</button>
            </div>
          )}
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-xs font-semibold" role="group" aria-label="Distance unit">
            {Object.keys(UNITS).map((u) => (
              <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)} className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-3 ${unit === u ? 'bg-primary text-white' : 'bg-white text-gray-600'}`}>{UNITS[u].abbr}</button>
            ))}
          </div>
        </div>
      </div>
      {mapMode ? (
        <p className="text-xs leading-snug text-gray-500">Zoom the map in or out to set your radius — the circle and the figures below follow the map. Switch to <span className="font-semibold">Slider</span> to set it by hand.</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-2">
            {U.presets.map((p) => {
              const m = Math.round(clamp(p * U.factor, bounds.min, bounds.max));
              const active = Math.abs(m - radiusM) < 1;
              return (
                <button key={p} type="button" onClick={() => setRadiusM(m)} className={`inline-flex min-h-[44px] items-center rounded-xl border px-3 text-xs font-semibold active:scale-95 ${active ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700'}`}>{p} {U.abbr}</button>
              );
            })}
          </div>
          <input
            type="range" min={bounds.min} max={bounds.max} step={Math.round(U.step * U.factor)}
            value={radiusM} onChange={(e) => setRadiusM(Number(e.target.value))}
            aria-label={`Radius in ${U.label}`} className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-gray-400"><span>{fmtRadius(bounds.min, unit)}</span><span>{fmtRadius(bounds.max, unit)}</span></div>
        </>
      )}
    </div>
  );
}
