import React, { useState } from 'react';
import { Wine, AlertTriangle, CheckCircle2 } from 'lucide-react';

// Minimum Unit Pricing guardrail. Floor = £0.65 × units; units = ABV% × litres.
// Scotland 65p (since Sep 2024); Wales 65p from 1 Oct 2026. Selling below is an offence.
const MUP = 0.65;

export default function MupCalculator() {
  const [f, setF] = useState({ abv: '', ml: '', packQty: '1', price: '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const abv = parseFloat(f.abv);
  const ml = parseFloat(f.ml);
  const packQty = Math.max(1, parseInt(f.packQty, 10) || 1);
  const price = parseFloat(f.price);
  const valid = Number.isFinite(abv) && Number.isFinite(ml) && abv > 0 && ml > 0;

  const unitsEach = valid ? (abv * ml) / 1000 : null;      // UK units per item
  const floor = valid ? MUP * unitsEach * packQty : null;   // legal floor for the pack
  const belowFloor = floor != null && Number.isFinite(price) && price < floor - 0.005;

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Wine className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="ABV %" value={f.abv} onChange={set('abv')} placeholder="e.g. 4" />
          <Field label="Volume (ml)" value={f.ml} onChange={set('ml')} placeholder="e.g. 440" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Pack qty" value={f.packQty} onChange={set('packQty')} placeholder="1" />
          <Field label="Your price £" value={f.price} onChange={set('price')} placeholder="e.g. 1.29" />
        </div>
      </div>

      {floor != null && (
        <div className="mt-4 rounded-xl bg-gray-50 p-4 text-center">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Minimum legal price</div>
          <div className="mt-1 text-3xl font-extrabold tabular-nums text-gray-900">£{floor.toFixed(2)}</div>
          <div className="mt-0.5 text-xs text-gray-500">{unitsEach.toFixed(2)} units each × {packQty} × 65p</div>
        </div>
      )}

      {floor != null && Number.isFinite(price) && (
        <div className={`mt-3 flex items-center gap-2 rounded-xl p-3 text-sm font-semibold ${belowFloor ? 'bg-danger-light text-danger-dark' : 'bg-success-light text-success-dark'}`}>
          {belowFloor ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
          {belowFloor
            ? `£${price.toFixed(2)} is BELOW the floor — illegal. Raise to at least £${floor.toFixed(2)}.`
            : `£${price.toFixed(2)} is above the floor — OK.`}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-snug text-gray-400">
        MUP applies in Scotland &amp; Wales (65p/unit). Units = ABV% × litres. A guide — confirm your
        region’s current rate; selling below the floor is a criminal offence.
      </p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={onChange} placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
    </label>
  );
}
