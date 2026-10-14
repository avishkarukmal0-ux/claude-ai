import React, { useState } from 'react';
import { PackageCheck, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { VAPE_LIMITS } from '../../data/compliance';

// Vape product check — a before-you-stock helper against the verified product limits (TRPR 2016). Limits are
// data (VAPE_LIMITS); the MHRA notified-list check and supplier evidence are owner confirmations, not computed.
export default function VapeProductCheck() {
  const [f, setF] = useState({ nicotine: '', bottle: '', tank: '' });
  const [onMhra, setOnMhra] = useState(false);
  const [evidence, setEvidence] = useState(false);
  const [reusable, setReusable] = useState(null); // rechargeable AND refillable with replaceable coil?
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const singleUse = reusable === false;

  const n = parseFloat(f.nicotine);
  const b = parseFloat(f.bottle);
  const t = parseFloat(f.tank);
  const checks = [
    { label: `Nicotine ≤ ${VAPE_LIMITS.nicotineMaxMgMl} mg/ml`, val: f.nicotine, ok: !Number.isFinite(n) || n <= VAPE_LIMITS.nicotineMaxMgMl },
    { label: `Refill bottle ≤ ${VAPE_LIMITS.refillMaxMl} ml`, val: f.bottle, ok: !Number.isFinite(b) || b <= VAPE_LIMITS.refillMaxMl },
    { label: `Tank ≤ ${VAPE_LIMITS.tankMaxMl} ml`, val: f.tank, ok: !Number.isFinite(t) || t <= VAPE_LIMITS.tankMaxMl },
  ];

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <PackageCheck className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Nicotine mg/ml" value={f.nicotine} onChange={set('nicotine')} placeholder="e.g. 20" />
        <Field label="Bottle ml" value={f.bottle} onChange={set('bottle')} placeholder="e.g. 10" />
        <Field label="Tank ml" value={f.tank} onChange={set('tank')} placeholder="e.g. 2" />
      </div>

      <ul className="mt-4 space-y-2">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-2 rounded-xl p-3 text-sm font-medium ${c.val === '' ? 'bg-gray-50 text-gray-500' : c.ok ? 'bg-success-light text-success-dark' : 'bg-danger-light text-danger-dark'}`}>
            {c.val === '' ? <AlertTriangle className="h-5 w-5 shrink-0 text-gray-400" /> : c.ok ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}
            {c.label}{c.val !== '' && !c.ok ? ' — over the limit' : ''}
          </li>
        ))}
      </ul>

      {/* Disposable-vape ban (since 1 Jun 2025) — a single-use device can't be sold. */}
      <div className="mt-3 rounded-xl border border-warning/40 bg-warning-light/50 p-3">
        <p className="mb-2 text-sm font-medium text-warning-dark">Rechargeable AND refillable, with a replaceable coil?</p>
        <div className="flex gap-2">
          {[['true', 'Yes'], ['false', 'No']].map(([v, lbl]) => {
            const on = String(reusable) === v;
            return (
              <button key={v} type="button" onClick={() => setReusable(v === 'true')} aria-pressed={on}
                className={`inline-flex min-h-[44px] min-w-[72px] items-center justify-center rounded-xl border px-3 text-sm font-semibold ${on ? 'border-primary bg-primary-50 text-primary' : 'border-gray-200 bg-white text-gray-600'}`}>{lbl}</button>
            );
          })}
        </div>
        {singleUse && <p className="mt-2 text-xs font-semibold text-danger-dark">Single-use (disposable) vapes cannot be sold — illegal since 1 June 2025. Don’t stock this.</p>}
      </div>

      <label className="mt-3 flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
        <span className="text-sm text-gray-700">On the MHRA notified-products list? <a href={VAPE_LIMITS.mhraUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex min-h-[44px] items-center text-primary underline">check</a></span>
        <input type="checkbox" checked={onMhra} onChange={(e) => setOnMhra(e.target.checked)} className="h-5 w-5" />
      </label>
      <label className="mt-2 flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
        <span className="text-sm text-gray-700">Supplier evidence kept on file?</span>
        <input type="checkbox" checked={evidence} onChange={(e) => setEvidence(e.target.checked)} className="h-5 w-5" />
      </label>

      <ComplianceNote verified={VAPE_LIMITS.lastVerified} href={VAPE_LIMITS.sourceUrl} label="Selling vapes (Business Companion)">
        Limits: nicotine ≤ 20 mg/ml, refill bottle ≤ 10 ml, tank ≤ 2 ml; child-resistant & tamper-evident;
        banned additives (vitamins, caffeine, taurine, colourings — flavours allowed). Products must be on the
        MHRA notified list before sale; keep supplier evidence.
      </ComplianceNote>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input type="number" inputMode="decimal" min="0" step="0.1" value={value} onChange={onChange} placeholder={placeholder}
        className="min-h-[44px] w-full rounded-xl border border-gray-200 px-2 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
    </label>
  );
}
