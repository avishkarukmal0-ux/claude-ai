import React, { useState } from 'react';
import { Cloud, AlertTriangle, CalendarClock } from 'lucide-react';
import ComplianceNote from './ComplianceNote';

// Vaping Products Duty helper. From 1 Oct 2026: £2.20 per 10ml (= 22p/ml) on all e-liquid (incl.
// nicotine-free). The DUTY itself is paid UPSTREAM by manufacturers, importers and registered
// warehousekeepers — a retailer doesn't pay or file it; they just pay a higher wholesale price and may pass it
// on. We only ESTIMATE that pass-through. Stock held before 1 Oct 2026 can sell through unstamped until
// 31 Mar 2027; from 1 Apr 2027 all retail vape packs need a duty stamp.
const DUTY_PER_ML = 0.22;
const VAT = 0.2;
const STAMP_DEADLINE = new Date('2027-03-31T23:59:59Z'); // last day unstamped stock may be sold

function daysUntil(target, now = new Date()) {
  const a = new Date(now); a.setHours(0, 0, 0, 0);
  const b = new Date(target); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

export default function VpdCalculator() {
  const [ml, setMl] = useState('');
  const [price, setPrice] = useState('');

  const v = parseFloat(ml);
  const p = parseFloat(price);
  const needSize = ml.trim() === '' || !(v > 0);
  const valid = Number.isFinite(v) && v > 0;
  const duty = valid ? DUTY_PER_ML * v : null;
  const dutyIncVat = duty == null ? null : duty * (1 + VAT);
  const newPrice = duty == null || !Number.isFinite(p) ? null : p + dutyIncVat;
  const stampDays = daysUntil(STAMP_DEADLINE);

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Cloud className="h-7 w-7" strokeWidth={1.75} />
      </div>

      {/* Single-use/disposable vape ban — in force since 1 Jun 2025. */}
      <div className="mb-3 flex items-start gap-2 rounded-xl bg-danger-light p-3 text-sm font-medium text-danger-dark">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Single-use (disposable) vapes have been <b>illegal to sell</b> since 1 June 2025 — don’t stock them.</span>
      </div>

      {/* Duty-stamp transition countdown. */}
      {stampDays >= 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-warning-light p-3 text-sm text-warning-dark">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
          <span><b>{stampDays} day{stampDays === 1 ? '' : 's'}</b> to sell through unstamped stock. From 1 Apr 2027 all retail vape packs need a duty stamp.</span>
        </div>
      )}

      <div className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">E-liquid size (ml)</span>
          <input type="number" inputMode="decimal" min="0" step="1" value={ml} onChange={(e) => setMl(e.target.value)} placeholder="e.g. 10"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-gray-500">Current price £ incl. VAT (optional)</span>
          <input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 3.99"
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </label>
      </div>

      {needSize && (
        <p className="mt-4 text-center text-sm font-medium text-gray-500">Enter the bottle size (ml) to see the duty.</p>
      )}

      {duty != null && (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Stat label="Duty per bottle" value={`£${duty.toFixed(2)}`} />
          <Stat label="Est. pass-through (inc VAT)" value={`£${dutyIncVat.toFixed(2)}`} />
        </div>
      )}
      {newPrice != null && (
        <div className="mt-3 rounded-xl bg-primary-50 p-3 text-center text-sm font-semibold text-primary-700">
          Suggested new price ≈ £{newPrice.toFixed(2)}
          <span className="mt-0.5 block text-xs font-normal text-primary-700/80">Estimated pass-through only — your price + duty + VAT, no margin added.</span>
        </div>
      )}

      <ComplianceNote verified="2026-10-12" href="https://www.gov.uk/government/publications/introduction-of-vaping-products-duty" label="HMRC Vaping Products Duty">
        Duty is paid upstream by manufacturers, importers and warehousekeepers — not by the shop; you only see
        it in the wholesale price. Stock held before 1 Oct 2026 may be sold until 31 Mar 2027; from 1 Apr 2027
        all retail vape packs need a duty stamp. A guide — confirm final HMRC rates &amp; duty-stamp rules.
      </ComplianceNote>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3 text-center">
      <div className="text-lg font-bold tabular-nums text-gray-900">{value}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-400">{label}</div>
    </div>
  );
}
