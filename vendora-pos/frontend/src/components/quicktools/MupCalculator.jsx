import React, { useState } from 'react';
import { Wine, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import Abbr from '../common/Abbr';
import { getBusinessProfile } from '../../lib/businessProfile';

// Minimum Unit Pricing guardrail. Floor = rate × units; units = ABV% × litres.
// MUP applies in Scotland and Wales only (not England). Rates are jurisdiction- AND date-specific:
//   Scotland: £0.65/unit (since 30 Sep 2024).
//   Wales:    £0.50/unit until 30 Sep 2026, then £0.65/unit from 1 Oct 2026.
// A guide — always confirm the current rate against the primary source; selling below is an offence.
const WALES_65_FROM = Date.UTC(2026, 9, 1); // 2026-10-01

function rateFor(jurisdiction, now = new Date()) {
  if (jurisdiction === 'wales') return now.getTime() >= WALES_65_FROM ? 0.65 : 0.50;
  return 0.65; // scotland
}

export default function MupCalculator() {
  const nation = getBusinessProfile().region;
  const noMup = nation === 'england' || nation === 'ni';
  const [jurisdiction, setJurisdiction] = useState(nation === 'wales' ? 'wales' : 'scotland');
  const [f, setF] = useState({ abv: '', ml: '', packQty: '1', price: '' });

  // MUP is law in Scotland and Wales only. If the shop told us it's in England or NI, say so plainly.
  if (noMup) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
          <Info className="h-7 w-7" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-semibold text-gray-900">No <Abbr term="MUP" /> in your nation</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-gray-500">Minimum Unit Pricing applies in Scotland and Wales, not in {nation === 'ni' ? 'Northern Ireland' : 'England'}.</p>
        <ComplianceNote verified="2026-10-12" href="https://www.gov.wales/minimum-pricing-alcohol-guidance-retailers" label="MUP guidance (gov.wales)" />
      </div>
    );
  }
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const rate = rateFor(jurisdiction);
  const ratePence = Math.round(rate * 100);
  const abv = parseFloat(f.abv);
  const ml = parseFloat(f.ml);
  const packQty = Math.max(1, parseInt(f.packQty, 10) || 1);
  const price = parseFloat(f.price);
  const valid = Number.isFinite(abv) && Number.isFinite(ml) && abv > 0 && ml > 0;

  const unitsEach = valid ? (abv * ml) / 1000 : null;      // UK units per item
  // The legal minimum must be ROUNDED UP to the next whole penny (Scottish Government guidance:
  // mygov.scot/minimum-unit-price-alcohol). Rounding to nearest (or down) could show a price a penny
  // under the legal floor as acceptable — an offence. Ceil to pence.
  const floor = valid ? Math.ceil(rate * unitsEach * packQty * 100) / 100 : null;
  const belowFloor = floor != null && Number.isFinite(price) && price < floor - 1e-9;

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Wine className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <div className="mb-3 flex rounded-xl bg-gray-100 p-1 text-sm font-semibold">
        {[['scotland', 'Scotland'], ['wales', 'Wales']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setJurisdiction(id)}
            aria-pressed={jurisdiction === id}
            className={`flex min-h-[44px] flex-1 items-center justify-center rounded-lg ${jurisdiction === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
            {label}
          </button>
        ))}
      </div>
      <p className="mb-3 text-center text-xs text-gray-400">Current rate: <b className="text-gray-600">{ratePence}p/unit</b></p>

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
          <div className="mt-0.5 text-xs text-gray-500">{unitsEach.toFixed(2)} units each × {packQty} × {ratePence}p</div>
        </div>
      )}

      {floor != null && Number.isFinite(price) && (
        <div className={`mt-3 flex items-center gap-2 rounded-xl p-3 text-sm font-semibold ${belowFloor ? 'bg-danger-light text-danger-dark' : 'bg-success-light text-success-dark'}`}>
          {belowFloor ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
          {belowFloor
            ? `£${price.toFixed(2)} is BELOW the ${jurisdiction === 'wales' ? 'Wales' : 'Scotland'} floor — illegal. Raise to at least £${floor.toFixed(2)}.`
            : `£${price.toFixed(2)} is above the floor — OK.`}
        </div>
      )}

      <ComplianceNote verified="2026-10-12" href="https://www.gov.wales/minimum-pricing-alcohol-guidance-retailers" label="Minimum Unit Pricing (gov.wales)">
        MUP is 65p/unit in Scotland and, in Wales, 65p/unit since 1 Oct 2026 — not England or Northern Ireland.
        Units = ABV% × litres. A guide — confirm the current rate for your nation; selling below the floor is a
        criminal offence.
      </ComplianceNote>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <input type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={onChange} placeholder={placeholder}
        className="min-h-[44px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
    </label>
  );
}
