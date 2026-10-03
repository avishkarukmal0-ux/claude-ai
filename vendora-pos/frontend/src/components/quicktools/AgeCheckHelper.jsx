import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';

// Age-check HELPER (not a POS). Shows the Challenge-25 cut-off date and checks a DOB.
// Nothing is sold, logged, or transacted here — it's a counter reference only.
const MIN_AGE = 18; // alcohol / tobacco / vape

function subtractYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() - years);
  return d;
}

function ageOn(dob, on = new Date()) {
  let age = on.getFullYear() - dob.getFullYear();
  const m = on.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) age--;
  return age;
}

export default function AgeCheckHelper() {
  const today = new Date();
  const cutoff = subtractYears(today, MIN_AGE); // must be born on/before this to be 18
  const cutoffStr = cutoff.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const [dob, setDob] = useState('');
  const dobDate = dob ? new Date(dob) : null;
  const valid = dobDate && !Number.isNaN(dobDate.getTime());
  const age = valid ? ageOn(dobDate) : null;
  const ok = age !== null && age >= MIN_AGE;
  const challenge = age !== null && age < 25; // Challenge 25: under 25 → ask for ID

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <ShieldCheck className="h-7 w-7" strokeWidth={1.75} />
      </div>

      {/* The counter rule of thumb */}
      <div className="rounded-xl bg-gray-50 p-4 text-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Must be born on or before</div>
        <div className="mt-1 text-2xl font-extrabold tabular-nums text-gray-900">{cutoffStr}</div>
        <div className="mt-1 text-sm text-gray-500">to be {MIN_AGE} today</div>
      </div>

      {/* Optional DOB check */}
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Check a date of birth</span>
        <input
          type="date"
          value={dob}
          max={today.toISOString().slice(0, 10)}
          onChange={(e) => setDob(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>

      {valid && (
        <div className={`mt-4 rounded-xl p-4 ${ok ? 'bg-success-light' : 'bg-danger-light'}`}>
          <div className={`flex items-center gap-2 text-base font-bold ${ok ? 'text-success-dark' : 'text-danger-dark'}`}>
            {ok ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            {ok ? `OK — ${age} years old` : `Under age — ${age} years old`}
          </div>
          {ok && challenge && (
            <div className="mt-1 text-sm font-medium text-warning-dark">
              Under 25 — ask for photo ID (Challenge 25).
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-snug text-gray-400">
        A helper only — it doesn’t record or approve a sale. Always check valid photo ID. The till
        handles the actual refusal log at checkout.
      </p>
    </div>
  );
}
