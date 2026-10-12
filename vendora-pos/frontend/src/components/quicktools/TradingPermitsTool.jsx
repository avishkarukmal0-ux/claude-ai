import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { MapPin } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { readJSON, writeJSON } from '../../lib/storage';

// Trading permits (Mobile & value / market trader). Stores the shop's street-trading consent + insurance so
// expiries can be flagged. Rules are set locally — NO council limits are hard-coded.
const NAME = 'trading_permits_v1';
function daysLeft(d) { if (!d) return null; const t = new Date(d); t.setHours(0, 0, 0, 0); return Math.round((t - new Date().setHours(0, 0, 0, 0)) / 86400000); }

export default function TradingPermitsTool() {
  const [f, setF] = useState(() => { const v = readJSON(NAME, {}); return { consentNumber: v.consentNumber || '', council: v.council || '', consentExpiry: v.consentExpiry || '', pitch: v.pitch || '', insuranceLevel: v.insuranceLevel || '', insuranceExpiry: v.insuranceExpiry || '', notes: v.notes || '' }; });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const save = () => { const r = writeJSON(NAME, f); if (r.ok) toast.success('Saved'); else toast.error('Couldn’t save'); };

  const cd = daysLeft(f.consentExpiry); const idd = daysLeft(f.insuranceExpiry);
  const expiryTone = (n) => (n == null ? '' : n < 0 ? 'text-danger font-semibold' : n <= 30 ? 'text-warning-dark font-semibold' : 'text-gray-500');

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <MapPin className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <div className="space-y-2">
        <input value={f.consentNumber} onChange={set('consentNumber')} placeholder="Street-trading consent number" aria-label="Consent number" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
        <input value={f.council} onChange={set('council')} placeholder="Council" aria-label="Council" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
        <input value={f.pitch} onChange={set('pitch')} placeholder="Pitch / location" aria-label="Pitch" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
        <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">Consent expiry</span>
          <input type="date" value={f.consentExpiry} onChange={set('consentExpiry')} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none" />
        </label>
        {cd != null && <p className={`text-xs ${expiryTone(cd)}`}>Consent {cd < 0 ? `expired ${-cd}d ago` : `expires in ${cd}d`}</p>}
        <input value={f.insuranceLevel} onChange={set('insuranceLevel')} placeholder="Public liability level (e.g. £5m)" aria-label="Insurance level" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
        <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">Insurance expiry</span>
          <input type="date" value={f.insuranceExpiry} onChange={set('insuranceExpiry')} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none" />
        </label>
        {idd != null && <p className={`text-xs ${expiryTone(idd)}`}>Insurance {idd < 0 ? `expired ${-idd}d ago` : `expires in ${idd}d`}</p>}
        <input value={f.notes} onChange={set('notes')} placeholder="Notes (fees, hours, conditions…)" aria-label="Notes" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
      </div>

      <button type="button" onClick={save} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-white">Save</button>

      <ComplianceNote verified="2026-10-12" href="https://www.gov.uk/apply-for-a-street-trading-licence" label="Street trading (GOV.UK)">
        Street trading is controlled locally — consent, pitch, notice periods and the required insurance level
        all vary by council (England & Wales under the 1982 Act; Scotland & NI differ). Check YOUR council.
      </ComplianceNote>
    </div>
  );
}
