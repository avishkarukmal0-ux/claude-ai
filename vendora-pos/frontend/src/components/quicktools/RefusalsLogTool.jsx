import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldX, Trash2 } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { useRefusalsLog, REFUSAL_REASONS } from '../../lib/refusalsLog';

// Refusals log (off-licence / age-restricted). A quick record of a refused sale — evidence of due diligence
// for a premises licence. Record-only; no sale is processed here.
const REASON_LABEL = Object.fromEntries(REFUSAL_REASONS.map((r) => [r.id, r.label]));

export default function RefusalsLogTool() {
  const { refusals, addRefusal, removeRefusal } = useRefusalsLog();
  const [f, setF] = useState({ reason: 'underage', product: '', note: '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  function save() {
    const res = addRefusal(f);
    if (!res.ok) { toast.error(res.error || 'Couldn’t save'); return; }
    toast.success('Refusal logged');
    setF({ reason: f.reason, product: '', note: '' });
  }

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <ShieldX className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Reason</span>
        <select value={f.reason} onChange={set('reason')} className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none">
          {REFUSAL_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </label>
      <div className="mt-2 grid grid-cols-1 gap-2">
        <input value={f.product} onChange={set('product')} placeholder="What they tried to buy (optional)"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        <input value={f.note} onChange={set('note')} placeholder="Note (optional)"
          className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>
      <button type="button" onClick={save} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-white">
        Log refusal
      </button>

      {refusals.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent refusals</h3>
          <ul className="space-y-2">
            {refusals.slice(0, 20).map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900">{REASON_LABEL[r.reason] || r.reason}{r.product ? ` · ${r.product}` : ''}</span>
                  <span className="block text-xs text-gray-500">{new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{r.by ? ` · ${r.by}` : ''}{r.note ? ` · ${r.note}` : ''}</span>
                </span>
                <button type="button" onClick={() => removeRefusal(r.id)} className="p-1 text-gray-300 hover:text-danger" aria-label="Delete entry"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ComplianceNote verified="2026-10-12" href="https://www.gov.uk/guidance/alcohol-licensing" label="Alcohol licensing (GOV.UK)">
        A refusals record shows due diligence under your premises licence. Keep it honest and current.
      </ComplianceNote>
    </div>
  );
}
