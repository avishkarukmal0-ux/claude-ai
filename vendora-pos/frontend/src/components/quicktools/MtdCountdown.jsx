import React from 'react';
import { FileClock, Info } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { getBusinessProfile, mtdApplies, mtdReason } from '../../lib/businessProfile';

// MTD for Income Tax quarterly update deadlines (indicative): 7 Aug, 7 Nov, 7 Feb, 7 May.
const DEADLINES = [
  { month: 7, day: 7, label: 'Q1 (Apr–Jul) update' },  // 7 Aug
  { month: 10, day: 7, label: 'Q2 (Jul–Oct) update' }, // 7 Nov
  { month: 1, day: 7, label: 'Q3 (Oct–Jan) update' },  // 7 Feb
  { month: 4, day: 7, label: 'Q4 (Jan–Apr) update' },  // 7 May
];

function nextDeadline(from = new Date()) {
  const candidates = [];
  for (const y of [from.getFullYear(), from.getFullYear() + 1]) {
    for (const d of DEADLINES) {
      const date = new Date(y, d.month, d.day);
      if (date >= startOfDay(from)) candidates.push({ ...d, date });
    }
  }
  candidates.sort((a, b) => a.date - b.date);
  return candidates[0];
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

export default function MtdCountdown() {
  const profile = getBusinessProfile();
  const next = nextDeadline();
  const days = daysBetween(new Date(), next.date);
  const dateStr = next.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // MTD for Income Tax only applies to qualifying sole traders. The home grid already hides this tool when it
  // doesn't apply, but if it's reached directly, say why rather than show a deadline that isn't theirs.
  if (!mtdApplies(profile)) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
          <Info className="h-7 w-7" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-semibold text-gray-900">MTD for Income Tax doesn’t apply to you yet</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-gray-500">{mtdReason(profile) || 'Update your tax details to check.'}</p>
        <ComplianceNote verified="2026-10-12" href="https://www.gov.uk/guidance/sign-up-your-business-for-making-tax-digital-for-income-tax" label="MTD for Income Tax (GOV.UK)">
          Mandation: over £50k from Apr 2026, over £30k from Apr 2027. Limited companies file Corporation Tax
          instead.
        </ComplianceNote>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <FileClock className="h-7 w-7" strokeWidth={1.75} />
      </div>
      <div className="text-5xl font-extrabold tabular-nums text-gray-900">{days}</div>
      <div className="mt-1 text-sm font-medium text-gray-500">days until your next MTD update</div>

      <div className="mt-5 rounded-xl bg-gray-50 p-4 text-left">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Next deadline</div>
        <div className="mt-1 text-base font-semibold text-gray-900">{dateStr}</div>
        <div className="text-sm text-gray-500">{next.label}</div>
      </div>

      <div className="mt-4 rounded-xl bg-primary-50 p-3 text-sm text-primary-700">
        Vendora tracks your key dates so you’re never caught out. You still file with HMRC or your accountant.
      </div>

      <ComplianceNote verified="2026-10-12" href="https://www.gov.uk/guidance/sign-up-your-business-for-making-tax-digital-for-income-tax" label="MTD for Income Tax (GOV.UK)">
        Indicative quarterly update dates (7 Aug · 7 Nov · 7 Feb · 7 May). Always confirm your exact obligations
        with HMRC or your accountant.
      </ComplianceNote>
    </div>
  );
}
