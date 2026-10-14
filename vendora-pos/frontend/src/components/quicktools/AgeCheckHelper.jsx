import React, { useState } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { getBusinessProfile } from '../../lib/businessProfile';
import { AGE_RULES } from '../../data/compliance';

// Age-check HELPER (not a POS). It is product-aware (alcohol / vapes / tobacco) and nation-aware. Nothing is
// sold, logged or transacted — it's a counter reference. Rules come from editable data (AGE_RULES); reported
// tobacco dates carry a "confirm commencement" note.
const PRODUCTS = [
  { id: 'alcohol', label: 'Alcohol', minAge: AGE_RULES.alcoholMinAge },
  { id: 'vape', label: 'Vapes & nicotine', minAge: AGE_RULES.vapeMinAge },
  { id: 'tobacco', label: 'Tobacco', minAge: AGE_RULES.tobaccoMinAge },
];

function subtractYears(date, years) { const d = new Date(date); d.setFullYear(d.getFullYear() - years); return d; }
function ageOn(dob, on = new Date()) {
  let age = on.getFullYear() - dob.getFullYear();
  const m = on.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && on.getDate() < dob.getDate())) age--;
  return age;
}

export default function AgeCheckHelper() {
  const today = new Date();
  const profile = getBusinessProfile();
  const nation = profile.region;
  const [product, setProduct] = useState('alcohol');
  const [challenge25, setChallenge25] = useState(false); // England/Wales/NI: local licence condition (optional)
  const [dob, setDob] = useState('');

  const spec = PRODUCTS.find((p) => p.id === product) || PRODUCTS[0];
  // Scotland's statutory age-verification policy minimum is 25 (mandatory). England/Wales/NI: Challenge 25 is
  // usually a LOCAL licence condition — offer it as a toggle. The "challenge" age is the stricter of the two.
  const challengeAge = nation === 'scotland' ? AGE_RULES.scotlandChallengeAge : (challenge25 ? 25 : spec.minAge);
  const cutoff = subtractYears(today, spec.minAge); // born on/before this to meet the minimum age
  const cutoffStr = cutoff.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const dobDate = dob ? new Date(dob) : null;
  const parsed = dobDate && !Number.isNaN(dobDate.getTime());
  const future = parsed && dobDate > today;
  const age = parsed && !future ? ageOn(dobDate) : null;
  const tooOld = age !== null && age > 110;

  // Tobacco: reported generational rule — no sale to anyone born on/after 1 Jan 2009 (born on/before 31 Dec 2008).
  const tobaccoBornCutoff = new Date(AGE_RULES.tobaccoBornOnOrBefore);
  const tobaccoBlocked = product === 'tobacco' && parsed && !future && dobDate > tobaccoBornCutoff;
  const meetsMinAge = age !== null && age >= spec.minAge && !tobaccoBlocked;
  const ok = meetsMinAge && !tooOld;
  const challenge = ok && age < challengeAge;

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <ShieldCheck className="h-7 w-7" strokeWidth={1.75} />
      </div>

      {/* Product */}
      <div className="mb-3 flex rounded-xl bg-gray-100 p-1 text-sm font-semibold">
        {PRODUCTS.map((p) => (
          <button key={p.id} type="button" onClick={() => setProduct(p.id)} aria-pressed={product === p.id}
            className={`flex min-h-[44px] flex-1 items-center justify-center rounded-lg ${product === p.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{p.label}</button>
        ))}
      </div>

      {/* The counter rule of thumb */}
      <div className="rounded-xl bg-gray-50 p-4 text-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Must be born on or before</div>
        <div className="mt-1 text-2xl font-extrabold tabular-nums text-gray-900">{cutoffStr}</div>
        <div className="mt-1 text-sm text-gray-500">to be {spec.minAge} today</div>
        {nation === 'scotland' && <div className="mt-1 text-xs font-medium text-primary">Scotland: ask for ID if they look under 25 (required).</div>}
      </div>

      {/* Challenge 25 toggle — only where it's a local condition, not Scotland (already mandatory 25). */}
      {nation !== 'scotland' && (
        <label className="mt-3 flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
          <span className="text-sm text-gray-700">My licence requires Challenge 25</span>
          <input type="checkbox" checked={challenge25} onChange={(e) => setChallenge25(e.target.checked)} className="h-5 w-5" />
        </label>
      )}

      {/* Optional DOB check */}
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Check a date of birth</span>
        <input type="date" value={dob} max={today.toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)}
          className="min-h-[44px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
      </label>

      {future && (
        <div className="mt-4 rounded-xl bg-danger-light p-4 text-base font-bold text-danger-dark">
          <span className="flex items-center gap-2"><XCircle className="h-5 w-5" /> Invalid date — that’s in the future.</span>
        </div>
      )}
      {tooOld && (
        <div className="mt-4 rounded-xl bg-warning-light p-4 text-base font-bold text-warning-dark">
          <span className="flex items-center gap-2"><XCircle className="h-5 w-5" /> Check this date — that’s over 110 years ago.</span>
        </div>
      )}

      {age !== null && !tooOld && (
        <div className={`mt-4 rounded-xl p-4 ${ok ? 'bg-success-light' : 'bg-danger-light'}`}>
          <div className={`flex items-center gap-2 text-base font-bold ${ok ? 'text-success-dark' : 'text-danger-dark'}`}>
            {ok ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            {tobaccoBlocked ? `Do not sell tobacco — born after ${new Date(AGE_RULES.tobaccoBornOnOrBefore).toLocaleDateString('en-GB')}` : ok ? `OK — ${age} years old` : `Under age — ${age} years old`}
          </div>
          {tobaccoBlocked && (
            <div className="mt-1 flex items-start gap-1 text-xs font-medium text-danger-dark"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Reported generational rule — confirm commencement for your nation.</div>
          )}
          {challenge && (
            <div className="mt-1 text-sm font-medium text-warning-dark">Under {challengeAge} — ask for photo ID.</div>
          )}
        </div>
      )}

      <ComplianceNote verified={AGE_RULES.lastVerified} href={AGE_RULES.sourceUrl} label="Tobacco & Vapes Act (GOV.UK)">
        A helper only — it doesn’t record or approve a sale. Always check valid photo ID (photo, DOB, hologram).
        Tobacco dates are reported — confirm your nation’s commencement. Record refused sales in the Refusals log.
      </ComplianceNote>
    </div>
  );
}
