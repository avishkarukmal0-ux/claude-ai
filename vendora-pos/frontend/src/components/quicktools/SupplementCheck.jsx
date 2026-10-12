import React, { useState } from 'react';
import { Pill, AlertTriangle } from 'lucide-react';
import ComplianceNote from './ComplianceNote';

// Food supplement + novel-food checklist (Health-food). A checklist of the label points a supplement needs,
// plus a novel-food register check. Reported rules (gov/FSA guidance, partly dated) — a helper, not advice.
const ITEMS = [
  ['name', 'Named "food supplement"'],
  ['ingredients', 'Ingredients (allergens emphasised)'],
  ['dose', 'Recommended daily dose + "do not exceed"'],
  ['storage', 'Storage + "keep out of reach of young children"'],
  ['date', 'Date mark'],
  ['amounts', 'Amount of each vitamin/mineral/active'],
  ['varied', '"Not a substitute for a varied diet"'],
  ['address', 'Business / importer address'],
  ['permitted', 'Vitamins/minerals on the permitted list & form'],
];

export default function SupplementCheck() {
  const [checked, setChecked] = useState({});
  const [novel, setNovel] = useState('');
  const [novelDate, setNovelDate] = useState('');
  const toggle = (k) => setChecked((p) => ({ ...p, [k]: !p[k] }));
  const missing = ITEMS.filter(([k]) => !checked[k]);

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <Pill className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <ul className="space-y-2">
        {ITEMS.map(([k, lbl]) => (
          <li key={k}>
            <label className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
              <span className="text-sm text-gray-700">{lbl}</span>
              <input type="checkbox" checked={!!checked[k]} onChange={() => toggle(k)} className="h-5 w-5" />
            </label>
          </li>
        ))}
      </ul>

      {missing.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-warning-light p-3 text-sm font-medium text-warning-dark">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Still to confirm: {missing.map(([, l]) => l).join('; ')}.
        </div>
      )}

      <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
        <label className="flex min-h-[44px] items-center justify-between gap-2">
          <span className="text-sm text-gray-700">Novel food? Checked on the FSA register?</span>
          <select value={novel} onChange={(e) => setNovel(e.target.value)} className="min-h-[44px] rounded-lg border border-gray-200 px-2 text-sm">
            <option value="">—</option>
            <option value="not-novel">Not novel</option>
            <option value="authorised">Novel &amp; authorised</option>
            <option value="unknown">Not checked</option>
          </select>
        </label>
        <label className="mt-2 flex min-h-[44px] items-center justify-between gap-2">
          <span className="text-xs text-gray-500">Date checked</span>
          <input type="date" value={novelDate} onChange={(e) => setNovelDate(e.target.value)} className="min-h-[44px] rounded-lg border border-gray-200 px-2 text-sm" />
        </label>
      </div>

      <ComplianceNote verified="2026-10-12" href="https://food.gov.uk/business-guidance/novel-foods" label="Novel foods (FSA)">
        Reported label rules; a retailer that imports is responsible. A food not eaten significantly in the
        UK/EU before 15 May 1997 is novel and must be authorised before sale — check the FSA register yourself.
      </ComplianceNote>
    </div>
  );
}
