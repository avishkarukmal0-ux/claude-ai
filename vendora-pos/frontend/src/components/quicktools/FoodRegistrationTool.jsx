import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { BadgeCheck } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { readJSON, writeJSON } from '../../lib/storage';
import { getBusinessProfile } from '../../lib/businessProfile';

// Food business registration + Food Hygiene Rating tracker (Fresh / World groups). Stores a few owner-entered
// facts (food_registration_v1); display of the rating is mandatory in Wales & NI, voluntary in England.
const NAME = 'food_registration_v1';
const RATINGS = ['awaiting', '5', '4', '3', '2', '1', '0'];

export default function FoodRegistrationTool() {
  const nation = getBusinessProfile().region;
  const mandatoryDisplay = nation === 'wales' || nation === 'ni';
  const [f, setF] = useState(() => { const v = readJSON(NAME, {}); return { registered: v.registered || '', registeredOn: v.registeredOn || '', rating: v.rating || '', lastInspection: v.lastInspection || '' }; });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  function save() {
    const res = writeJSON(NAME, f);
    if (res.ok) toast.success('Saved'); else toast.error(res.error || 'Couldn’t save');
  }

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <BadgeCheck className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Registered with your council?</span>
        <select value={f.registered} onChange={set('registered')} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none">
          <option value="">Choose…</option>
          <option value="yes">Yes</option>
          <option value="pending">Applied — waiting</option>
          <option value="no">Not yet</option>
        </select>
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">Registered on</span>
          <input type="date" value={f.registeredOn} onChange={set('registeredOn')} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none" />
        </label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-gray-500">Last inspection</span>
          <input type="date" value={f.lastInspection} onChange={set('lastInspection')} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none" />
        </label>
      </div>
      <label className="mt-2 block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Food Hygiene Rating</span>
        <select value={f.rating} onChange={set('rating')} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none">
          <option value="">Choose…</option>
          {RATINGS.map((r) => <option key={r} value={r}>{r === 'awaiting' ? 'Awaiting first rating' : `${r} / 5`}</option>)}
        </select>
      </label>

      <div className={`mt-3 rounded-xl p-3 text-sm ${mandatoryDisplay ? 'bg-warning-light text-warning-dark' : 'bg-gray-50 text-gray-600'}`}>
        {mandatoryDisplay
          ? 'Displaying your rating sticker is mandatory in your nation.'
          : nation === 'england' ? 'Displaying the rating is voluntary in England (but good for trade).' : 'Display rules differ by nation — Wales & NI mandatory, England voluntary.'}
      </div>

      <button type="button" onClick={save} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-white">Save</button>

      <ComplianceNote verified="2026-10-12" href="https://www.food.gov.uk/business-guidance/register-a-food-business" label="Register a food business (FSA)">
        Register with your local authority at least 28 days before trading (free, can’t be refused). The council
        inspects and awards a 0–5 rating, published after a 21-day appeal period.
      </ComplianceNote>
    </div>
  );
}
