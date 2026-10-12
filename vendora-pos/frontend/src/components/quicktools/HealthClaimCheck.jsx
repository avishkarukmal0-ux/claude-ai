import React, { useMemo, useState } from 'react';
import { HeartPulse, AlertTriangle, CheckCircle2 } from 'lucide-react';
import ComplianceNote from './ComplianceNote';

// Health-claim checker (Health-food). A SOFT checker: it flags words on shelf text / signs that usually need an
// authorised claim behind them. It is NOT a legal determination — only authorised claims on the GB register may
// be used, with evidence. Nothing is stored.
const FLAGS = [
  'healthy', 'boosts immunity', 'immune', 'detox', 'superfood', 'cleanse', 'cleanse', 'cures', 'cure',
  'treats', 'prevents', 'anti-inflammatory', 'weight loss', 'slimming', 'fat burning', 'lowers cholesterol',
  'good for you', 'miracle',
];

export default function HealthClaimCheck() {
  const [text, setText] = useState('');
  const [evidence, setEvidence] = useState('');
  const hits = useMemo(() => {
    const t = text.toLowerCase();
    return [...new Set(FLAGS.filter((w) => t.includes(w)))];
  }, [text]);

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <HeartPulse className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Shelf text / sign wording</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="e.g. Our turmeric boosts immunity and is great for detox"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
      </label>

      {text.trim() && (hits.length > 0 ? (
        <div className="mt-3 rounded-xl bg-warning-light p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-warning-dark"><AlertTriangle className="h-5 w-5 shrink-0" /> Flagged wording</div>
          <p className="mt-1 text-sm text-warning-dark">“{hits.join('”, “')}” — only use a claim authorised on the GB register, tied to the specific nutrient, with evidence. A general claim needs a specific authorised claim alongside it.</p>
          <input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Evidence / register reference" aria-label="Evidence or register reference"
            className="mt-2 w-full rounded-xl border border-warning/30 px-3 py-2 text-sm focus:outline-none" />
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-success-light p-3 text-sm font-medium text-success-dark"><CheckCircle2 className="h-5 w-5 shrink-0" /> No flagged wording spotted.</div>
      ))}

      <ComplianceNote verified="2026-10-12" href="https://www.gov.uk/government/publications/great-britain-nutrition-and-health-claims-nhc-register" label="GB NHC register">
        A helper, not a legal determination. In GB only claims on the Nutrition &amp; Health Claims register may be
        used (NI follows the EU register). Slimming/weight-loss claims are covered separately.
      </ComplianceNote>
    </div>
  );
}
