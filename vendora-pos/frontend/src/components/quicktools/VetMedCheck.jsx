import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Syringe, CheckCircle2, XCircle } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { readJSON, writeJSON } from '../../lib/storage';

// Pet-shop veterinary-medicines check (Mobile & value, when selling live animals). Flea/worming products fall
// into AVM-GSL (general sale) or NFA-VPS / POM-VPS (need a registered SQP present). This checks a product's
// category and whether an SQP is recorded, and tracks the premises SQP/authorisation expiry.
const NAME = 'animal_licence_v1'; // shares the pet-shop object store
const CATEGORIES = [
  ['AVM-GSL', 'AVM-GSL — general sale'],
  ['NFA-VPS', 'NFA-VPS — needs an SQP'],
  ['POM-VPS', 'POM-VPS — needs an SQP'],
];

export default function VetMedCheck() {
  const [cat, setCat] = useState('AVM-GSL');
  const [sqpPresent, setSqpPresent] = useState(false);
  const [prem, setPrem] = useState(() => { const v = readJSON(NAME, {}); return { sqpName: v.sqpName || '', sqpExpiry: v.sqpExpiry || '' }; });
  const needsSqp = cat !== 'AVM-GSL';
  const blocked = needsSqp && !sqpPresent;

  function savePrem() { const cur = readJSON(NAME, {}); const r = writeJSON(NAME, { ...cur, ...prem }); if (r.ok) toast.success('Saved'); else toast.error('Couldn’t save'); }

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Syringe className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Product distribution category</span>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none">
          {CATEGORIES.map(([id, lbl]) => <option key={id} value={id}>{lbl}</option>)}
        </select>
      </label>

      {needsSqp && (
        <label className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
          <span className="text-sm text-gray-700">A registered SQP is handling this sale?</span>
          <input type="checkbox" checked={sqpPresent} onChange={(e) => setSqpPresent(e.target.checked)} className="h-5 w-5" />
        </label>
      )}

      <div className={`mt-3 flex items-center gap-2 rounded-xl p-3 text-sm font-semibold ${blocked ? 'bg-danger-light text-danger-dark' : 'bg-success-light text-success-dark'}`}>
        {blocked ? <XCircle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
        {blocked ? 'Do not sell over the counter — an SQP must handle an NFA-VPS / POM-VPS sale.' : needsSqp ? 'OK — SQP handling the sale.' : 'General sale (AVM-GSL) — no SQP needed.'}
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Premises SQP / authorisation</p>
        <input value={prem.sqpName} onChange={(e) => setPrem((p) => ({ ...p, sqpName: e.target.value }))} placeholder="SQP name" aria-label="SQP name" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <label className="block"><span className="mb-1 block text-xs text-gray-500">Authorisation / SQP expiry</span>
          <input type="date" value={prem.sqpExpiry} onChange={(e) => setPrem((p) => ({ ...p, sqpExpiry: e.target.value }))} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none" />
        </label>
        <button type="button" onClick={savePrem} className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-gray-900 px-3 text-sm font-semibold text-white">Save premises details</button>
      </div>

      <ComplianceNote verified="2026-10-12" href="https://www.gov.uk/guidance/retail-of-veterinary-medicines" label="Retail of veterinary medicines (VMD)">
        Each premises supplying NFA-VPS/POM-VPS must be authorised with a registered SQP, present at handover.
        Some spot-ons are categorised differently — check each product on the VMD register before stocking.
      </ComplianceNote>
    </div>
  );
}
