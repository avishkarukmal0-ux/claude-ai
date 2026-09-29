import React, { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Trash2, TrendingDown, PiggyBank, AlertTriangle, CalendarClock, CalendarPlus } from 'lucide-react';
import { useWaste } from '../../lib/wasteStore';
import { useInventory, DATE_TYPES, fefo, undatedQty } from '../../lib/inventoryStore';

function newOpId() {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  return `wb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const money = (v) => `£${(Number(v) || 0).toFixed(2)}`;

// Waste & savings tracker — money lost to the bin vs money rescued by marking down in time.
// Batch-aware: expiring stock is reviewed earliest-first per dated batch, and binning removes
// from the correct batch. Local-first.
export default function WasteView({ onBack }) {
  const { entries, addEntry, removeEntry, monthWasted, monthSaved } = useWaste();
  const { products, recordWaste, reverseWaste, wasteBatch, reverseBatchWaste, addBatch } = useInventory();

  const [form, setForm] = useState({ name: '', value: '', qty: '1' });
  const [dc, setDc] = useState({ open: false, productId: '', qty: '', expiry: '', dateType: 'best-before' });

  function log(type) {
    if (!form.value) return;
    // Quick-log is standalone (no product link) — it does NOT change stock.
    addEntry({ type, name: form.name, value: form.value, qty: form.qty });
    setForm({ name: '', value: '', qty: '1' });
  }

  // Bin a FEFO row (a dated batch, or an unbatched product) as ONE operation: reduce the right
  // stock + log a typed waste movement + add the £ ledger entry, linked for undo.
  function binRow(row) {
    const { product: p, batchId, dateType } = row;
    const opGroupId = newOpId();
    const valuation = (p.cost ?? 0) * 1;
    if (batchId) {
      const res = wasteBatch({ id: p.id, batchId, qty: 1, valuation, reason: 'expired / near-date', opGroupId });
      if (!res.ok) { toast.error(res.error || 'Couldn’t bin that'); return; }
      addEntry({ type: 'wasted', name: p.name, value: (p.cost ?? 0) * res.applied, qty: res.applied, productId: p.id, batchId: opGroupId, productBatchId: batchId, batchInfo: res.batch, reason: 'expired / near-date' });
    } else {
      const res = recordWaste({ id: p.id, qty: 1, valuation, reason: 'expired / near-date', batchId: opGroupId });
      if (!res.ok) { toast.error(res.error || 'Couldn’t bin that'); return; }
      addEntry({ type: 'wasted', name: p.name, value: (p.cost ?? 0) * res.applied, qty: res.applied, productId: p.id, batchId: opGroupId, reason: 'expired / near-date' });
    }
    toast.success(`Binned 1 × ${p.name} · stock updated`);
  }

  // Undo restores stock + history consistently (batch-aware).
  function undoEntry(e) {
    if (e.type === 'wasted' && e.productId && e.batchId) {
      if (e.productBatchId) reverseBatchWaste({ id: e.productId, qty: e.qty, opGroupId: e.batchId, batch: e.batchInfo });
      else reverseWaste({ id: e.productId, qty: e.qty, batchId: e.batchId });
    }
    removeEntry(e.id);
  }

  function dateCode() {
    if (!dc.productId || !dc.qty || !dc.expiry) { toast.error('Pick a product, quantity and date'); return; }
    const res = addBatch(dc.productId, { qty: dc.qty, expiry: dc.expiry, dateType: dc.dateType });
    if (!res.ok) { toast.error(res.error || 'Couldn’t date-code that'); return; }
    toast.success(`Date-coded ${res.allocated} unit${res.allocated === 1 ? '' : 's'}`);
    setDc({ open: false, productId: '', qty: '', expiry: '', dateType: 'best-before' });
  }

  // FEFO across dated batches (and unbatched products), soonest expiry first.
  const rows = useMemo(() => fefo(products), [products]);
  // Estimated markdown opportunity: RETAIL value of soft (sellable) near/expired stock. Labelled
  // as an estimate — NOT money already saved.
  const atRisk = useMemo(() => rows.filter((r) => !r.info.mustPull)
    .reduce((s, r) => s + (Number(r.product.price) || 0) * (Number(r.qty) || 0), 0), [rows]);
  const codeable = useMemo(() => products.filter((p) => undatedQty(p) > 0), [products]);

  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>

      <h2 className="mb-1 text-base font-bold text-gray-900">Waste &amp; savings</h2>
      <p className="mb-4 text-xs text-gray-400">Log what you bin and what you rescue. See the money either way.</p>

      {/* FEFO — expiring / sell first, earliest-expiry batch first */}
      {rows.length > 0 && (
        <section className="mb-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <CalendarClock className="h-3.5 w-3.5" /> Sell first — expiring{atRisk > 0 && <span className="ml-1 font-normal normal-case text-gray-400">· {money(atRisk)} at risk (est.)</span>}
          </h3>
          <ul className="space-y-2">
            {rows.map((row) => {
              const { product: p, batchId, qty, info } = row;
              return (
                <li key={`${p.id}:${batchId || 'nb'}`} className={`flex items-center gap-3 rounded-2xl border p-3 shadow-sm ${info.mustPull ? 'border-danger/40 bg-danger-light' : info.status === 'expired' ? 'border-warning/40 bg-warning-light' : 'border-gray-100 bg-white'}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{p.name} <span className="font-normal text-gray-400">×{qty}</span></span>
                    <span className={`block text-[11px] ${info.status === 'expired' ? 'text-danger' : 'text-gray-500'}`}>
                      {DATE_TYPES[info.type].label} {info.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ·{' '}
                      {info.daysLeft < 0 ? `${Math.abs(info.daysLeft)}d ago` : info.daysLeft === 0 ? 'today' : `in ${info.daysLeft}d`}
                    </span>
                    {info.mustPull ? (
                      <span className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-danger-dark"><AlertTriangle className="h-3 w-3" /> Do not sell — pull now</span>
                    ) : (
                      <span className="mt-0.5 inline-block rounded-full bg-warning-light px-1.5 py-0.5 text-[10px] font-semibold text-warning-dark">Mark down to sell in time</span>
                    )}
                  </span>
                  <button
                    type="button"
                    disabled={qty <= 0}
                    onClick={() => binRow(row)}
                    className="shrink-0 rounded-lg bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-danger-dark ring-1 ring-danger/20 active:scale-95 disabled:opacity-40"
                  >
                    {info.mustPull ? 'Pull' : 'Bin'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Date-code stock (optional batches) */}
      {codeable.length > 0 && (
        <section className="mb-4">
          {!dc.open ? (
            <button type="button" onClick={() => setDc((d) => ({ ...d, open: true }))} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-2.5 text-xs font-semibold text-gray-600 active:scale-[0.99]">
              <CalendarPlus className="h-4 w-4" /> Date-code stock (add a batch)
            </button>
          ) : (
            <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Date-code stock</h3>
              <select value={dc.productId} onChange={(e) => setDc((d) => ({ ...d, productId: e.target.value }))} className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none">
                <option value="">Choose a product…</option>
                {codeable.map((p) => <option key={p.id} value={p.id}>{p.name} · {undatedQty(p)} undated</option>)}
              </select>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <label className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-500">Qty
                  <input value={dc.qty} onChange={(e) => setDc((d) => ({ ...d, qty: e.target.value }))} inputMode="numeric" className="w-full border-none p-0 text-gray-900 focus:outline-none" />
                </label>
                <input type="date" value={dc.expiry} onChange={(e) => setDc((d) => ({ ...d, expiry: e.target.value }))} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:border-primary focus:outline-none" />
              </div>
              <select value={dc.dateType} onChange={(e) => setDc((d) => ({ ...d, dateType: e.target.value }))} className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none">
                {Object.entries(DATE_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}{v.hard ? ' (legal — pull after date)' : ''}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setDc({ open: false, productId: '', qty: '', expiry: '', dateType: 'best-before' })} className="rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-600">Cancel</button>
                <button type="button" onClick={dateCode} className="rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white">Add batch</button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Headline stats */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><TrendingDown className="h-4 w-4 text-danger" /> Wasted · {monthName}</div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-danger">£{monthWasted.toFixed(2)}</div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><PiggyBank className="h-4 w-4 text-success" /> Saved · {monthName}</div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-success">£{monthSaved.toFixed(2)}</div>
        </div>
      </div>

      {monthSaved > 0 && (
        <div className="mb-4 rounded-xl bg-success-light p-3 text-center text-sm font-semibold text-success-dark">
          You’ve rescued £{monthSaved.toFixed(2)} from the bin this month. 🎉
        </div>
      )}

      {/* Quick add */}
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="What is it? (e.g. Milk 2L)" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-500">
            £<input value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} inputMode="decimal" placeholder="value" className="w-full border-none p-0 text-gray-900 focus:outline-none" />
          </label>
          <label className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-500">
            Qty<input value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} inputMode="numeric" className="w-full border-none p-0 text-gray-900 focus:outline-none" />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={!form.value} onClick={() => log('wasted')} className="flex items-center justify-center gap-1.5 rounded-xl bg-danger px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            <Trash2 className="h-4 w-4" /> Binned it
          </button>
          <button type="button" disabled={!form.value} onClick={() => log('saved')} className="flex items-center justify-center gap-1.5 rounded-xl bg-success px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
            <PiggyBank className="h-4 w-4" /> Saved it
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-gray-400">
          “Saved” = marked down or used before it expired. That’s money you kept. This quick log is
          for stock that isn’t in your catalogue — it doesn’t change stock levels. To bin a catalogued
          item and update stock, use the <span className="font-semibold">Sell first</span> list above.
        </p>
      </div>

      {/* Recent entries */}
      {entries.length > 0 && (
        <>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent</h3>
          <ul className="space-y-2">
            {entries.slice(0, 30).map((e) => (
              <li key={e.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${e.type === 'saved' ? 'bg-success-light text-success-dark' : 'bg-danger-light text-danger-dark'}`}>
                  {e.type === 'saved' ? <PiggyBank className="h-5 w-5" /> : <Trash2 className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{e.name}</span>
                  <span className="block text-[11px] text-gray-500">
                    {e.qty > 1 ? `×${e.qty} · ` : ''}{new Date(e.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </span>
                <span className={`text-sm font-bold tabular-nums ${e.type === 'saved' ? 'text-success' : 'text-danger'}`}>
                  {e.type === 'saved' ? '+' : '−'}£{e.value.toFixed(2)}
                </span>
                <button type="button" onClick={() => undoEntry(e)} className="p-1 text-gray-300 hover:text-danger" aria-label={e.productId ? 'Undo — restores stock' : 'Delete'} title={e.productId ? 'Undo — restores stock' : 'Delete'}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
