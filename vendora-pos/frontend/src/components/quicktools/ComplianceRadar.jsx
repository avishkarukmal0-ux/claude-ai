import React from 'react';
import { ShieldAlert, AlertCircle } from 'lucide-react';
import { complianceForFamily } from '../../config/compliance';
import { getSavedShopType } from '../../config/shopTypes';
import { formatUK } from '../../lib/dateUtils';

// Compliance Radar — the UK-shop deadlines this shop type can get caught out by.
// Read-only reference; tailored to the saved family. No backend.
export default function ComplianceRadar() {
  const saved = getSavedShopType();
  const { upcoming, ongoing } = complianceForFamily(saved?.familyId);

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <ShieldAlert className="h-7 w-7" strokeWidth={1.75} />
      </div>

      {upcoming.length > 0 && (
        <>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Coming up</h4>
          <ul className="space-y-2">
            {upcoming.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                <span
                  className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg text-center leading-none ${
                    c.days <= 7 ? 'bg-danger-light text-danger-dark' : 'bg-primary-50 text-primary'
                  }`}
                >
                  <span className="text-base font-extrabold tabular-nums">{c.days}</span>
                  <span className="text-[9px] font-semibold uppercase">days</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-900">{c.name}</span>
                  <span className="block text-xs text-gray-500">{formatUK(c.date)} · {c.note}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {ongoing.length > 0 && (
        <>
          <h4 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">Always on</h4>
          <ul className="space-y-2">
            {ongoing.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5 rounded-xl bg-gray-50 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <span className="text-sm text-gray-700">
                  <span className="font-semibold text-gray-900">{c.name}</span> — {c.note}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4 text-[11px] leading-snug text-gray-400">
        Indicative dates for planning — always confirm your exact obligations with HMRC, your local
        authority, or your accountant. Vendora keeps the records that make these easy.
      </p>
    </div>
  );
}
