import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldX, Trash2, Download, CheckCheck } from 'lucide-react';
import ComplianceNote from './ComplianceNote';
import { useRefusalsLog, REFUSAL_REASONS, refusalsCsv } from '../../lib/refusalsLog';

// Refusals log (off-licence / age-restricted). A record of a refused sale — evidence of due diligence for a
// premises licence. Record-only; no sale is processed here. Keep ~12 months; weekly manager sign-off; export.
const REASON_LABEL = Object.fromEntries(REFUSAL_REASONS.map((r) => [r.id, r.label]));

export default function RefusalsLogTool({ prefill }) {
  const { refusals, signoffs, addRefusal, removeRefusal, signOff } = useRefusalsLog();
  // Opened from the Age check's "Log this refusal" → pre-fill the reason + product it hands over.
  const [f, setF] = useState(() => ({ reason: prefill?.reason || 'underage', product: prefill?.product || '', note: '', initials: '' }));
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const lastSignoff = signoffs[0] || null;
  const needsSignoff = refusals.length > 0 && (!lastSignoff || refusals[0].at > lastSignoff.at);
  // Block an empty tap: a refusal record needs at least what they tried to buy, a note, or the staff initials
  // (every entry already carries a reason + a date/time). Keeps blank rows out of the audit trail.
  const hasDetail = !!(f.product.trim() || f.note.trim() || f.initials.trim());

  function save() {
    if (!hasDetail) { toast.error('Add the product, a note, or your initials first.'); return; }
    const res = addRefusal(f);
    if (!res.ok) { toast.error(res.error || 'Couldn’t save'); return; }
    toast.success('Refusal logged');
    setF((p) => ({ reason: p.reason, product: '', note: '', initials: p.initials }));
  }

  function exportCsv() {
    try {
      const blob = new Blob([refusalsCsv(refusals)], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `refusals-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.error('Couldn’t export'); }
  }

  function doSignOff() {
    const initials = (window.prompt('Manager initials for this week’s sign-off:') || '').trim();
    if (!initials) return;
    const res = signOff(initials);
    if (res.ok) toast.success('Signed off'); else toast.error('Couldn’t sign off');
  }

  return (
    <div>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <ShieldX className="h-7 w-7" strokeWidth={1.75} />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-500">Reason</span>
        <select value={f.reason} onChange={set('reason')} className="min-h-[44px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none">
          {REFUSAL_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </label>
      <div className="mt-2 grid grid-cols-1 gap-2">
        <input value={f.product} onChange={set('product')} placeholder="What they tried to buy (optional)" aria-label="What they tried to buy"
          className="min-h-[44px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        <div className="grid grid-cols-3 gap-2">
          <input value={f.initials} onChange={set('initials')} placeholder="Initials" aria-label="Staff initials" maxLength={4}
            className="col-span-1 min-h-[44px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base uppercase text-gray-900 focus:border-primary focus:outline-none" />
          <input value={f.note} onChange={set('note')} placeholder="Note (optional)" aria-label="Note"
            className="col-span-2 min-h-[44px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base text-gray-900 focus:border-primary focus:outline-none" />
        </div>
      </div>
      <button type="button" onClick={save} disabled={!hasDetail} aria-describedby={!hasDetail ? 'refusal-hint' : undefined} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-white disabled:opacity-40">
        Log refusal
      </button>
      {!hasDetail && <p id="refusal-hint" className="mt-1 text-center text-xs text-gray-400">Add the product, a note, or your initials to log it.</p>}

      {/* Manager sign-off */}
      <div className={`mt-4 rounded-xl p-3 ${needsSignoff ? 'bg-warning-light' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-gray-600">
            {lastSignoff
              ? <>Last signed off {new Date(lastSignoff.at).toLocaleDateString('en-GB')} · {lastSignoff.initials}</>
              : 'Not signed off yet'}
            {needsSignoff && <span className="ml-1 font-semibold text-warning-dark">· review due</span>}
          </span>
          <button type="button" onClick={doSignOff} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white"><CheckCheck className="h-4 w-4" /> Sign off</button>
        </div>
      </div>

      {refusals.length > 0 && (
        <>
          <div className="mb-2 mt-5 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Recent refusals</h3>
            <button type="button" onClick={exportCsv} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700"><Download className="h-4 w-4" /> Export</button>
          </div>
          <ul className="space-y-2">
            {refusals.slice(0, 30).map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900">{REASON_LABEL[r.reason] || r.reason}{r.product ? ` · ${r.product}` : ''}</span>
                  <span className="block text-xs text-gray-500">{new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{r.initials ? ` · ${r.initials}` : ''}{r.note ? ` · ${r.note}` : ''}</span>
                </span>
                <button type="button" onClick={() => removeRefusal(r.id)} className="p-1 text-gray-300 hover:text-danger" aria-label="Delete entry"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ComplianceNote verified="2026-10-12" href="https://www.gov.uk/guidance/alcohol-licensing" label="Alcohol licensing (GOV.UK)">
        A refusals record shows due diligence under your premises licence — a manager should review and sign off
        weekly, and keep it about 12 months to show an inspector. Keep it honest and current.
      </ComplianceNote>
    </div>
  );
}
