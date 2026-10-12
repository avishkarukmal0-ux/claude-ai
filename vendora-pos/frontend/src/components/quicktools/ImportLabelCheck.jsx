import React, { useState } from 'react';
import { Globe2, AlertTriangle } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { getBusinessProfile } from '../../lib/businessProfile';

// Imported-food label check (World & specialist). A checklist for a shop that imports directly — it is then the
// legally responsible party. Reported rules (FSA guidance via summaries); the "English text" line is a check,
// not an asserted rule. NI address rules differ.
const ITEMS = [
  ['ingredients', 'Full ingredients list'],
  ['allergens', '14 allergens emphasised'],
  ['address', 'UK importer postal address (GB)'],
  ['origin', 'Country of origin where needed'],
  ['date', 'Date mark (use-by / best-before)'],
  ['english', 'Information in English'],
];

export default function ImportLabelCheck() {
  const nation = getBusinessProfile().region;
  const [checked, setChecked] = useState({});
  const [importer, setImporter] = useState('');
  const toggle = (k) => setChecked((p) => ({ ...p, [k]: !p[k] }));
  const missing = ITEMS.filter(([k]) => !checked[k]);

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Globe2 className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <input value={importer} onChange={(e) => setImporter(e.target.value)} placeholder="UK importer name & address" aria-label="UK importer name and address"
        className="mb-3 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />

      <ul className="space-y-2">
        {ITEMS.map(([k, lbl]) => (
          <li key={k}>
            <label className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
              <span className="text-sm text-gray-700">{lbl}</span>
              <input type="checkbox" checked={!!checked[k]} onChange={() => toggle(k)} className="h-5 w-5" />
            </label>
          </li>
        ))}
      </ul>

      {missing.length > 0 ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-warning-light p-3 text-sm font-medium text-warning-dark">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Needs relabel / check: {missing.map(([, l]) => l.toLowerCase()).join(', ')}.
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-success-light p-3 text-sm font-medium text-success-dark">All label points checked.</div>
      )}

      {(nation === 'ni') && (
        <p className="mt-2 text-xs text-warning-dark">Northern Ireland: the label needs an address in NI or the EU, not a GB address — check this line against NI rules.</p>
      )}

      <ComplianceNote verified="2026-10-12" href="https://www.food.gov.uk/business-guidance/importing-food" label="Importing food (FSA)">
        Reported: GB labels have needed a UK postal address since 1 Jan 2024; NI differs. If you import directly
        you are the responsible party for composition, safety and labelling. Confirm on FSA guidance.
      </ComplianceNote>
    </div>
  );
}
