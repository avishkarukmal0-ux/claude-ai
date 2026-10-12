import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Thermometer, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { useTemperatureLog, UNIT_KINDS, readingSafe } from '../../lib/temperatureLog';

// Fridge/freezer temperature log (Fresh group). Record a reading; out-of-range readings are flagged.
export default function TemperatureLogTool() {
  const { readings, addReading, removeReading } = useTemperatureLog();
  const [f, setF] = useState({ unit: '', kind: 'chilled', tempC: '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const previewSafe = f.tempC === '' ? null : readingSafe(f.kind, f.tempC);

  function save() {
    const res = addReading(f);
    if (!res.ok) { toast.error(res.error || 'Couldn’t save'); return; }
    toast[res.reading.safe ? 'success' : 'error'](res.reading.safe ? 'Logged — in range' : 'Logged — OUT of range');
    setF((p) => ({ ...p, tempC: '' }));
  }

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Thermometer className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <div className="flex rounded-xl bg-gray-100 p-1 text-sm font-semibold">
        {Object.entries(UNIT_KINDS).map(([id, spec]) => (
          <button key={id} type="button" onClick={() => setF((p) => ({ ...p, kind: id }))} aria-pressed={f.kind === id}
            className={`flex-1 rounded-lg py-2 ${f.kind === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{spec.label}</button>
        ))}
      </div>
      <p className="mt-1 text-center text-xs text-gray-400">{UNIT_KINDS[f.kind].hint}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Unit name (optional)</span>
          <input value={f.unit} onChange={set('unit')} placeholder="e.g. Deli fridge"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Temperature °C</span>
          <input type="number" inputMode="decimal" step="0.1" value={f.tempC} onChange={set('tempC')} placeholder="e.g. 4"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </label>
      </div>

      {previewSafe === false && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-danger-light p-3 text-sm font-semibold text-danger-dark">
          <AlertTriangle className="h-5 w-5 shrink-0" /> Out of range — act on it (move stock, check the unit) and record it.
        </div>
      )}

      <button type="button" onClick={save} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-white">
        Log reading
      </button>

      {readings.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent readings</h3>
          <ul className="space-y-2">
            {readings.slice(0, 20).map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                {r.safe ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-danger" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900">{r.unit} · <span className={r.safe ? '' : 'text-danger'}>{r.tempC}°C</span></span>
                  <span className="block text-xs text-gray-500">{UNIT_KINDS[r.kind]?.label} · {new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{r.by ? ` · ${r.by}` : ''}</span>
                </span>
                <button type="button" onClick={() => removeReading(r.id)} className="p-1 text-gray-300 hover:text-danger" aria-label="Delete reading"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ComplianceNote verified="2026-10-12" href="https://www.food.gov.uk/business-guidance/safer-food-better-business-sfbb" label="FSA Safer Food Better Business">
        Chilled ≤ 8°C (aim 0–5°C), frozen ≤ −18°C. Keeping a temperature record is part of your food-safety
        management.
      </ComplianceNote>
    </div>
  );
}
