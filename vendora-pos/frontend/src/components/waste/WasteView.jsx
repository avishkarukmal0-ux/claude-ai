import React, { useState, useMemo } from 'react';
import { ArrowLeft, Trash2, TrendingDown, PiggyBank, Plus, AlertTriangle, CalendarClock } from 'lucide-react';
import { useWaste } from '../../lib/wasteStore';
import { useInventory, expiryInfo, DATE_TYPES } from '../../lib/inventoryStore';

// Waste & savings tracker — money lost to the bin vs money rescued by marking down
// in time. Local-first; the "£ saved this month" line is the motivating headline.
export default function WasteView({ onBack }) {
  const { entries, addEntry, removeEntry, monthWasted, monthSaved } = useWaste();
  const { products } = useInventory();
  const [form, setForm] = useState({ name: '', value: '', qty: '1' });

  function log(type) {
    if (!form.value) return;
    addEntry({ type, name: form.name, value: form.value, qty: form.qty });
    setForm({ name: '', value: '', qty: '1' });
  }

  // FEFO — products with a date, expired or within 7 days, soonest first.
  const expiring = useMemo(() => {
    return products
      .map((p) => ({ p, info: expiryInfo(p) }))
      .filter((x) => x.info && (x.info.status === 'expired' || x.info.status === 'soon'))
      .sort((a, b) => a.info.daysLeft - b.info.daysLeft);
  }, [products]);

  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>

      <h2 className="mb-1 text-base font-bold text-gray-900">Waste &amp; savings</h2>
      <p className="mb-4 text-xs text-gray-400">Log what you bin and what you rescue. See the money either way.</p>

      {/* FEFO — expiring / sell first */}
      {expiring.length > 0 && (
        <section className="mb-4">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <CalendarClock className="h-3.5 w-3.5" /> Sell first — expiring
          </h3>
          <ul className="space-y-2">
            {expiring.map(({ p, info }) => (
              <li key={p.id} className={`flex items-center gap-3 rounded-2xl border p-3 shadow-sm ${info.mustPull ? 'border-danger/40 bg-danger-light' : info.status === 'expired' ? 'border-warning/40 bg-warning-light' : 'border-gray-100 bg-white'}`}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{p.name}</span>
                  <span className={`block text-[11px] ${info.status === 'expired' ? 'text-danger' : 'text-gray-500'}`}>
                    {DATE_TYPES[info.type].label} {info.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} ·{' '}
                    {info.daysLeft < 0 ? `${Math.abs(info.daysLeft)}d ago` : info.daysLeft === 0 ? 'today' : `in ${info.daysLeft}d`}
                  </span>
                  {info.mustPull && (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-danger-dark"><AlertTriangle className="h-3 w-3" /> Do not sell — pull now</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => addEntry({ type: 'wasted', name: p.name, value: p.cost ?? 0, qty: 1 })}
                  className="shrink-0 rounded-lg bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-danger-dark ring-1 ring-danger/20 active:scale-95"
                >
                  Binned
                </button>
              </li>
            ))}
          </ul>
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
          “Saved” = marked down or used before it expired. That’s money you kept.
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
                <button type="button" onClick={() => removeEntry(e.id)} className="p-1 text-gray-300 hover:text-danger" aria-label="Delete">
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
