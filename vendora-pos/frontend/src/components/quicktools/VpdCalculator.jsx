import React, { useState } from 'react';
import { Cloud } from 'lucide-react';

// Vaping Products Duty helper. From 1 Oct 2026: £2.20 per 10ml (= 22p/ml) on all
// e-liquid (incl. nicotine-free). Stock held before that date can sell through unstamped.
const DUTY_PER_ML = 0.22;
const VAT = 0.2;

export default function VpdCalculator() {
  const [ml, setMl] = useState('');
  const [price, setPrice] = useState('');

  const v = parseFloat(ml);
  const p = parseFloat(price);
  const valid = Number.isFinite(v) && v > 0;
  const duty = valid ? DUTY_PER_ML * v : null;
  const dutyIncVat = duty == null ? null : duty * (1 + VAT);
  const newPrice = duty == null || !Number.isFinite(p) ? null : p + dutyIncVat;

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Cloud className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">E-liquid size (ml)</span>
          <input type="number" inputMode="decimal" min="0" step="1" value={ml} onChange={(e) => setMl(e.target.value)} placeholder="e.g. 10"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Current price £ (optional)</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 3.99"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </label>
      </div>

      {duty != null && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Stat label="Duty per bottle" value={`£${duty.toFixed(2)}`} />
          <Stat label="Duty + VAT" value={`£${dutyIncVat.toFixed(2)}`} />
        </div>
      )}
      {newPrice != null && (
        <div className="mt-3 rounded-xl bg-primary-50 p-3 text-center text-sm font-semibold text-primary-700">
          Suggested new price ≈ £{newPrice.toFixed(2)}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-snug text-gray-400">
        VPD starts 1 Oct 2026 (£2.20 / 10ml, all e-liquid). Stock you held before then can sell
        through unstamped. A guide — confirm final HMRC rates &amp; duty-stamp rules.
      </p>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 text-center">
      <div className="text-lg font-bold tabular-nums text-gray-900">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}
