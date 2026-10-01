import React, { useMemo } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Receipt, Building2, Share2, Trash2, ChevronRight, AlertTriangle, CalendarClock } from 'lucide-react';
import { useClaims, claimTotals, nextStates, OPEN_CLAIM_STATUSES } from '../../lib/claimStore';
import { useDeliveries, DELIVERY_ISSUES } from '../../lib/deliveryStore';

const money = (v) => `£${(Number(v) || 0).toFixed(2)}`;
const STATUS = {
  draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-500' },
  submitted: { label: 'Submitted', cls: 'bg-primary-50 text-primary' },
  acknowledged: { label: 'Acknowledged', cls: 'bg-primary-50 text-primary' },
  approved: { label: 'Approved', cls: 'bg-warning-light text-warning-dark' },
  rejected: { label: 'Rejected', cls: 'bg-gray-100 text-gray-400' },
  settled: { label: 'Settled', cls: 'bg-success-light text-success-dark' },
};
const ADVANCE_LABEL = { submitted: 'Mark submitted', acknowledged: 'Acknowledged', approved: 'Approve', rejected: 'Reject', settled: 'Mark settled' };

async function shareClaim(claim) {
  const lines = (claim.items || []).map((i) => `• ${i.name} x${i.qty} (${DELIVERY_ISSUES[i.reason]?.label || i.reason}) — ${money(i.amount)}`);
  const text = `Credit claim — ${claim.supplierName || 'supplier'}${claim.deliveryRef ? ` · ${claim.deliveryRef}` : ''}\n${lines.join('\n')}\nTotal requested: ${money(claimTotals(claim).requested)}\n\n— via Vendora`;
  try { if (navigator.share) { await navigator.share({ title: 'Supplier claim', text }); return; } } catch { /* fall through */ }
  try { await navigator.clipboard.writeText(text); toast.success('Claim copied — send it to your supplier'); return; } catch { /* ignore */ }
  toast('Couldn’t copy automatically', { icon: 'ℹ️' });
}

// Stage 5b — supplier claims. Raise from a delivery's flagged issues (with evidence photos),
// then track it through to credit actually received. Nothing is sent automatically.
export default function ClaimsView({ onBack }) {
  const { claims, createFromDelivery, updateClaim, advance, removeClaim } = useClaims();
  const { deliveries } = useDeliveries();

  const claimable = useMemo(() => deliveries.filter((d) => d.status === 'received'
    && (d.lines || []).some((l) => l.issue && DELIVERY_ISSUES[l.issue]?.claimable)
    && !claims.some((c) => c.deliveryId === d.id)), [deliveries, claims]);

  const open = useMemo(() => claims.filter((c) => OPEN_CLAIM_STATUSES.includes(c.status)), [claims]);
  const done = useMemo(() => claims.filter((c) => !OPEN_CLAIM_STATUSES.includes(c.status)), [claims]);

  function raise(d) {
    const c = createFromDelivery(d);
    if (c) toast.success('Claim drafted from delivery — review and submit');
    else toast('No claimable issues on that delivery');
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">Supplier claims</h2>
      <p className="mb-4 text-xs text-gray-400">Recover credit for missing, damaged or wrong-priced goods — evidenced by your delivery photos. You send it; we track it.</p>

      {claimable.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Deliveries with issues</h3>
          <ul className="space-y-2">
            {claimable.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3 shadow-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{d.supplierName || 'Delivery'}{d.reference && ` · ${d.reference}`}</span>
                  <span className="block text-[11px] text-gray-500">{(d.lines || []).filter((l) => l.issue && DELIVERY_ISSUES[l.issue]?.claimable).length} issue(s) to claim</span>
                </span>
                <button type="button" onClick={() => raise(d)} className="flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white active:scale-95">Raise claim <ChevronRight className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {open.length === 0 && done.length === 0 && claimable.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Receipt className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">No claims yet</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">When a delivery has missing or damaged goods, flag it on the Scan tab and raise a claim here.</p>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <section className="mb-5"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Open claims</h3><ul className="space-y-2">{open.map((c) => <ClaimCard key={c.id} c={c} updateClaim={updateClaim} advance={advance} removeClaim={removeClaim} />)}</ul></section>
          )}
          {done.length > 0 && (
            <section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Closed</h3><ul className="space-y-2">{done.map((c) => <ClaimCard key={c.id} c={c} updateClaim={updateClaim} advance={advance} removeClaim={removeClaim} />)}</ul></section>
          )}
        </>
      )}
    </div>
  );
}

// Module-scope so it keeps a stable component identity across parent re-renders — defined inside the
// parent, every keystroke created a NEW component type and remounted the card, dropping input focus (W9).
function ClaimCard({ c, updateClaim, advance, removeClaim }) {
    const t = claimTotals(c);
    const meta = STATUS[c.status] || STATUS.draft;
    return (
      <li className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{c.supplierName || 'Supplier'}{c.deliveryRef && <span className="font-normal text-gray-400"> · {c.deliveryRef}</span>}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>
        </div>

        <ul className="mb-2 space-y-1.5">
          {(c.items || []).map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-[12px]">
              {i.photo ? <img src={i.photo} alt="" className="h-7 w-7 rounded object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded bg-gray-100 text-gray-400"><AlertTriangle className="h-3.5 w-3.5" /></span>}
              <span className="min-w-0 flex-1 truncate text-gray-800">{i.name} <span className="text-gray-400">×{i.qty}</span> · {DELIVERY_ISSUES[i.reason]?.label || i.reason}</span>
              <span className="tabular-nums text-gray-600">{money(i.amount)}</span>
            </li>
          ))}
        </ul>

        {/* Honest amounts: requested vs approved vs received */}
        <div className="mb-2 grid grid-cols-3 gap-2 text-center text-[11px]">
          <div className="rounded-lg bg-gray-50 p-1.5"><div className="text-gray-400">Requested</div><div className="font-bold tabular-nums text-gray-900">{money(t.requested)}</div></div>
          <div className="rounded-lg bg-gray-50 p-1.5"><div className="text-gray-400">Approved</div><div className="font-bold tabular-nums text-gray-900">{t.approved == null ? '—' : money(t.approved)}</div></div>
          <div className="rounded-lg bg-gray-50 p-1.5"><div className="text-gray-400">Received</div><div className="font-bold tabular-nums text-success">{t.received == null ? '—' : money(t.received)}</div></div>
        </div>

        {(c.status === 'approved' || c.status === 'settled') && (
          <div className="mb-2 grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] text-gray-500">£ approved
              <input value={c.approvedAmount ?? ''} onChange={(e) => updateClaim(c.id, { approvedAmount: e.target.value === '' ? null : Number(e.target.value) })} inputMode="decimal" className="w-full border-none p-0 text-gray-900 focus:outline-none" />
            </label>
            <label className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] text-gray-500">£ received
              <input value={c.receivedAmount ?? ''} onChange={(e) => updateClaim(c.id, { receivedAmount: e.target.value === '' ? null : Number(e.target.value) })} inputMode="decimal" className="w-full border-none p-0 text-gray-900 focus:outline-none" />
            </label>
            <label className="col-span-2 flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] text-gray-500">Credit note
              <input value={c.creditNoteRef || ''} onChange={(e) => updateClaim(c.id, { creditNoteRef: e.target.value })} placeholder="reference" className="w-full border-none p-0 text-gray-900 focus:outline-none" />
            </label>
          </div>
        )}
        {OPEN_CLAIM_STATUSES.includes(c.status) && c.status !== 'draft' && (
          <label className="mb-2 flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] text-gray-500"><CalendarClock className="h-3.5 w-3.5" /> Follow up
            <input type="date" value={c.followUpDate || ''} onChange={(e) => updateClaim(c.id, { followUpDate: e.target.value })} className="w-full border-none p-0 text-gray-900 focus:outline-none" />
          </label>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => shareClaim(c)} className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 active:scale-95"><Share2 className="h-3.5 w-3.5" /> Share</button>
          {nextStates(c.status).map((s) => (
            <button key={s} type="button" onClick={() => advance(c.id, s)} className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold active:scale-95 ${s === 'rejected' ? 'bg-gray-100 text-gray-500' : 'bg-primary text-white'}`}>{ADVANCE_LABEL[s]}</button>
          ))}
          <button type="button" onClick={() => { if (confirm('Delete this claim?')) removeClaim(c.id); }} className="ml-auto p-1 text-gray-300 hover:text-danger" aria-label="Delete claim"><Trash2 className="h-4 w-4" /></button>
        </div>
      </li>
    );
}
