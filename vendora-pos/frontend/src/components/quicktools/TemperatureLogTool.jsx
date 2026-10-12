import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Thermometer, Trash2, AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { useTemperatureLog, UNIT_KINDS, readingSafe, temperatureCsv } from '../../lib/temperatureLog';

// Fridge/freezer/hot-hold/display temperature log (Fresh group). Out-of-range readings are flagged and prompt
// a corrective-action note; the log exports to CSV for records (keep ~12 months).
export default function TemperatureLogTool() {
  const { readings, addReading, removeReading } = useTemperatureLog();
  const [f, setF] = useState({ unit: '', kind: 'chilled', tempC: '', action: '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const previewSafe = f.tempC === '' ? null : readingSafe(f.kind, f.tempC);

  function save() {
    if (previewSafe === false && !f.action.trim()) { toast.error('Add a corrective-action note for an out-of-range reading.'); return; }
    const res = addReading(f);
    if (!res.ok) { toast.error(res.error || 'Couldn’t save'); return; }
    toast[res.reading.safe ? 'success' : 'error'](res.reading.safe ? 'Logged — in range' : 'Logged — OUT of range');
    setF((p) => ({ ...p, tempC: '', action: '' }));
  }

  function exportCsv() {
    try {
      const blob = new Blob([temperatureCsv(readings)], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `temperature-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error('Couldn’t export'); }
  }

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Thermometer className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {Object.entries(UNIT_KINDS).map(([id, spec]) => (
          <button key={id} type="button" onClick={() => setF((p) => ({ ...p, kind: id }))} aria-pressed={f.kind === id}
            className={`inline-flex min-h-[44px] items-center justify-center rounded-xl border px-2 text-sm font-semibold ${f.kind === id ? 'border-primary bg-primary-50 text-primary' : 'border-gray-200 bg-white text-gray-600'}`}>{spec.label}</button>
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
        <div className="mt-3 rounded-xl bg-danger-light p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-danger-dark"><AlertTriangle className="h-5 w-5 shrink-0" /> Out of range — record what you did.</div>
          <input value={f.action} onChange={set('action')} placeholder="Corrective action (e.g. moved stock, called engineer)" aria-label="Corrective action"
            className="mt-2 w-full rounded-xl border border-danger/30 px-3 py-2.5 text-base text-gray-900 focus:outline-none" />
        </div>
      )}

      <button type="button" onClick={save} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-white">
        Log reading
      </button>

      {readings.length > 0 && (
        <>
          <div className="mb-2 mt-5 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Recent readings</h3>
            <button type="button" onClick={exportCsv} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700"><Download className="h-4 w-4" /> Export</button>
          </div>
          <ul className="space-y-2">
            {readings.slice(0, 20).map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                {r.safe ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-danger" />}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-gray-900">
                    {r.unit} · <span className={r.safe ? '' : 'text-danger'}>{r.tempC}°C</span>
                    {!r.safe && <span className="rounded-full bg-danger-light px-1.5 py-0.5 text-xs font-bold uppercase text-danger-dark">OUT of range</span>}
                  </span>
                  <span className="block text-xs text-gray-500">{UNIT_KINDS[r.kind]?.label} · {new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{r.by ? ` · ${r.by}` : ''}{r.action ? ` · ${r.action}` : ''}</span>
                </span>
                <button type="button" onClick={() => removeReading(r.id)} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-gray-300 hover:text-danger" aria-label="Delete reading"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ComplianceNote verified="2026-10-12" href="https://www.food.gov.uk/business-guidance/safer-food-better-business-sfbb" label="FSA Safer Food Better Business">
        Chilled ≤ 8°C (aim 0–5°C) and hot-hold ≥ 63°C are the legal figures; the frozen −18°C target is reported
        — confirm it for your business. This supports your documented food-safety procedures (HACCP) — it isn’t
        the only legal format.
      </ComplianceNote>
    </div>
  );
}
