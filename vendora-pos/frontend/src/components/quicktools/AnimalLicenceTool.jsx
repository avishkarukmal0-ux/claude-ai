import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { PawPrint, AlertTriangle } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { readJSON, writeJSON } from '../../lib/storage';
import { getBusinessProfile } from '../../lib/businessProfile';

// Pet-shop animal licence (Mobile & value, when the shop sells live animals). Stores the council licence +
// risk rating and shows the key England rules. Other nations differ — flagged, not asserted.
const NAME = 'animal_licence_v1';

export default function AnimalLicenceTool() {
  const nation = getBusinessProfile().region;
  const [f, setF] = useState(() => { const v = readJSON(NAME, {}); return { licenceNumber: v.licenceNumber || '', expiry: v.expiry || '', riskRating: v.riskRating || '' }; });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const save = () => { const cur = readJSON(NAME, {}); const r = writeJSON(NAME, { ...cur, ...f }); if (r.ok) toast.success('Saved'); else toast.error('Couldn’t save'); };

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <PawPrint className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <div className="space-y-2">
        <input value={f.licenceNumber} onChange={set('licenceNumber')} placeholder="Council licence number" aria-label="Licence number" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">Expiry</span>
            <input type="date" value={f.expiry} onChange={set('expiry')} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none" />
          </label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">Risk rating</span>
            <input value={f.riskRating} onChange={set('riskRating')} placeholder="e.g. Low" aria-label="Risk rating" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none" />
          </label>
        </div>
      </div>
      <button type="button" onClick={save} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-white">Save</button>

      <div className="mt-4 space-y-2">
        <p className="flex items-start gap-2 rounded-xl bg-warning-light p-3 text-sm text-warning-dark"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No live animals may be sold from a market stall or public place.</p>
        <p className="flex items-start gap-2 rounded-xl bg-warning-light p-3 text-sm text-warning-dark"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> England (Lucy’s Law): puppies &amp; kittens can only be sold if you bred them — no third-party sales.</p>
      </div>

      <ComplianceNote verified="2026-10-12" href="https://www.gov.uk/guidance/animal-activities-licensing-in-england" label="Animal activities licensing (GOV.UK)">
        England: selling animals as pets in business needs a council licence (applicant 18+, inspection).
        Wales, Scotland &amp; NI have separate regimes{nation && nation !== 'england' ? ' — check yours' : ''}.
      </ComplianceNote>
    </div>
  );
}
