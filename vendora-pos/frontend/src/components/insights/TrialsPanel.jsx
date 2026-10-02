import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FlaskConical, MessageSquarePlus, Plus, ShoppingCart, PackageCheck, Check, RotateCw, TrendingUp, X } from 'lucide-react';
import { useTrials, trialOutcome } from '../../lib/trialStore';
import { useRequests } from '../../lib/requestStore';
import { useBuyList } from '../../lib/buyListStore';
import { useInventory } from '../../lib/inventoryStore';
import { useMovements } from '../../lib/movementStore';

const money = (v) => `£${(Number(v) || 0).toFixed(2)}`;

// Product trials — the shop's OWN experiments, reusing customer requests + the buy list + real sales/stock.
// Kept clearly separate from the published area statistics shown above it.
export default function TrialsPanel() {
  const { trials, createTrial, setStatus, decide, removeTrial } = useTrials();
  const { requests, setStatus: setRequestStatus } = useRequests();
  const { addItem, hasProduct } = useBuyList();
  const { products } = useInventory();
  const { records } = useMovements();

  const [form, setForm] = useState(null); // { name, barcode, qty, budget, reviewDate, hypothesis, requestId }
  const openRequests = useMemo(() => (requests || []).filter((r) => r.status !== 'stocked').slice(0, 6), [requests]);
  const active = useMemo(() => trials.filter((t) => t.status !== 'closed'), [trials]);
  const closed = useMemo(() => trials.filter((t) => t.status === 'closed').slice(0, 6), [trials]);
  const hasSalesData = useMemo(() => (records || []).some((r) => r.type === 'sale'), [records]);

  function outcomeFor(t) {
    const p = products.find((x) => (t.productId && x.id === t.productId) || (t.barcode && x.barcode === t.barcode));
    const pid = p ? p.id : t.productId;
    const soldUnits = pid ? (records || []).filter((r) => r.type === 'sale' && r.productId === pid && (r.at || 0) >= (t.startedAt || 0)).reduce((n, r) => n + Math.abs(Number(r.delta) || 0), 0) : null;
    const wasteUnits = pid ? (records || []).filter((r) => r.type === 'waste' && r.productId === pid && (r.at || 0) >= (t.startedAt || 0)).reduce((n, r) => n + Math.abs(Number(r.delta) || 0), 0) : 0;
    return trialOutcome(t, { soldUnits: pid ? soldUnits : null, remainingQty: p ? (Number(p.qty) || 0) : null, wasteUnits, hasSalesData });
  }

  function startForm(req) {
    setForm({ name: req ? req.name : '', barcode: (req && req.barcode) || '', qty: '', budget: '', reviewDate: '', hypothesis: '', requestId: req ? req.id : null });
  }
  function submit() {
    const res = createTrial(form);
    if (!res.ok) { toast.error(res.error || 'Couldn’t start the trial'); return; }
    if (form.requestId) setRequestStatus(form.requestId, 'planned');
    setForm(null);
    toast.success('Trial started — add it to your buy list when you’re ready to order.');
  }
  function toBuyList(t) {
    addItem({ productId: t.productId, name: t.name, barcode: t.barcode, qty: t.qty });
    setStatus(t.id, 'ordered');
    toast.success('Added to your buy list');
  }

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center gap-1.5">
        <FlaskConical className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-gray-900">Product trials</h3>
      </div>
      <p className="mb-3 rounded-lg bg-gray-50 p-2 text-[10px] leading-snug text-gray-500">
        <strong>Your records &amp; experiments</strong> — separate from the published area statistics above. A trial
        is a small, measurable test using your own buy list and sales. Area data can <em>suggest</em> an idea;
        only your sales can show whether it worked.
      </p>

      {/* Customer requests → trial */}
      {openRequests.length > 0 && !form && (
        <div className="mb-3">
          <h4 className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400"><MessageSquarePlus className="h-3 w-3" /> Shoppers have asked for</h4>
          <ul className="flex flex-wrap gap-1.5">
            {openRequests.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => startForm(r)} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 active:scale-95">{r.name} <span className="text-primary">+ trial</span></button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!form ? (
        <button type="button" onClick={() => startForm(null)} className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/40 bg-primary-50/50 px-3 py-2.5 text-xs font-semibold text-primary active:scale-[0.99]"><Plus className="h-4 w-4" /> Start a product trial</button>
      ) : (
        <div className="mb-3 rounded-2xl border border-primary/20 bg-white p-3 shadow-sm">
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Product to trial" aria-label="Product to trial" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          <div className="mb-2 grid grid-cols-3 gap-2">
            <input value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} inputMode="numeric" placeholder="Qty" aria-label="Quantity" className="rounded-xl border border-gray-200 px-2 py-2 text-sm focus:border-primary focus:outline-none" />
            <input value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} inputMode="decimal" placeholder="Budget £" aria-label="Budget" className="rounded-xl border border-gray-200 px-2 py-2 text-sm focus:border-primary focus:outline-none" />
            <input type="date" value={form.reviewDate} onChange={(e) => setForm((f) => ({ ...f, reviewDate: e.target.value }))} aria-label="Review date" className="rounded-xl border border-gray-200 px-2 py-2 text-sm text-gray-700 focus:border-primary focus:outline-none" />
          </div>
          <input value={form.hypothesis} onChange={(e) => setForm((f) => ({ ...f, hypothesis: e.target.value }))} placeholder="Why try it? (your hypothesis)" aria-label="Hypothesis" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm(null)} className="rounded-xl bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600">Cancel</button>
            <button type="button" onClick={submit} className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white">Start trial</button>
          </div>
        </div>
      )}

      {active.length > 0 && (
        <ul className="space-y-2">
          {active.map((t) => {
            const o = outcomeFor(t);
            return (
              <li key={t.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900">{t.name} <span className="font-normal text-gray-400">×{t.qty}</span></span>
                    <span className="block text-[11px] text-gray-500">{t.budget != null ? `${money(t.budget)} budget · ` : ''}{t.reviewDate ? `review ${new Date(t.reviewDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ` : ''}{t.status}</span>
                    {t.hypothesis && <span className="mt-0.5 block text-[11px] italic text-gray-400">“{t.hypothesis}”</span>}
                  </span>
                  <button type="button" onClick={() => removeTrial(t.id)} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Remove trial"><X className="h-4 w-4" /></button>
                </div>

                {/* Estimated outcome — confirmed sales only, else "Not enough data" */}
                <div className={`mt-2 rounded-lg p-2 text-[11px] ${o.enoughData ? (o.verdict === 'selling' ? 'bg-success-light text-success-dark' : o.verdict === 'slow' ? 'bg-warning-light text-warning-dark' : 'bg-gray-50 text-gray-600') : 'bg-gray-50 text-gray-500'}`}>
                  {o.summary}{o.remainingQty != null ? ` ${o.remainingQty} left in stock.` : ''}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {t.status === 'planned' && <button type="button" disabled={hasProduct(t.productId)} onClick={() => toBuyList(t)} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 active:scale-95 disabled:opacity-50"><ShoppingCart className="h-3.5 w-3.5" /> Add to buy list</button>}
                  {t.status !== 'received' && <button type="button" onClick={() => setStatus(t.id, 'received')} className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 active:scale-95"><PackageCheck className="h-3.5 w-3.5" /> Received</button>}
                  <span className="ml-auto flex gap-1.5">
                    <button type="button" onClick={() => decide(t.id, 'stop')} className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-danger">Stop</button>
                    <button type="button" onClick={() => decide(t.id, 'repeat')} className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1.5 text-[11px] font-semibold text-gray-700"><RotateCw className="h-3 w-3" /> Repeat</button>
                    <button type="button" onClick={() => decide(t.id, 'expand')} className="flex items-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-semibold text-white"><TrendingUp className="h-3 w-3" /> Expand</button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {closed.length > 0 && (
        <div className="mt-3">
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Past trials</h4>
          <ul className="space-y-1">
            {closed.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-3 py-2 text-[12px]">
                <span className="truncate text-gray-700">{t.name}</span>
                <span className={`shrink-0 font-semibold ${t.decision === 'expand' ? 'text-success' : t.decision === 'stop' ? 'text-gray-400' : 'text-gray-600'}`}>{t.decision || 'closed'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
