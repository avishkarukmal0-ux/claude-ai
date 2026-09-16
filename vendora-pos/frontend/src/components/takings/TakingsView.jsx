import React, { useState, useEffect } from 'react';
import { ArrowLeft, Banknote, CreditCard, Coins, Wallet, Trash2, Check } from 'lucide-react';
import { useTakings, entryTotals } from '../../lib/takingsStore';

// Takings & cash-up — enter the day's card + cash takings and count the drawer.
// Shows total takings + cash variance. Local-first; feeds the Owner glance.
export default function TakingsView({ onBack }) {
  const { entries, saveDay, removeEntry, todayEntry, monthTakings } = useTakings();
  const [f, setF] = useState({ card: '', cash: '', float: '', counted: '' });

  // Prefill from today's saved record if there is one.
  useEffect(() => {
    if (todayEntry) {
      setF({
        card: String(todayEntry.card ?? ''),
        cash: String(todayEntry.cash ?? ''),
        float: String(todayEntry.float ?? ''),
        counted: todayEntry.counted == null ? '' : String(todayEntry.counted),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const live = entryTotals(f);
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });
  const canSave = f.card !== '' || f.cash !== '';

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>

      <h2 className="mb-1 text-base font-bold text-gray-900">Takings &amp; cash-up</h2>
      <p className="mb-4 text-xs text-gray-400">Log the day’s takings and count the drawer. No till needed.</p>

      {/* Live totals */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-400">Takings today</div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-gray-900">£{live.takings.toFixed(2)}</div>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-400">Takings · {monthName}</div>
          <div className="mt-1 text-2xl font-extrabold tabular-nums text-primary">£{monthTakings.toFixed(2)}</div>
        </div>
      </div>

      {/* Entry */}
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="mb-2 grid grid-cols-2 gap-2">
          <MoneyField icon={CreditCard} label="Card £" value={f.card} onChange={set('card')} />
          <MoneyField icon={Banknote} label="Cash £" value={f.cash} onChange={set('cash')} />
        </div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Cash-up</div>
        <div className="grid grid-cols-2 gap-2">
          <MoneyField icon={Wallet} label="Float £" value={f.float} onChange={set('float')} />
          <MoneyField icon={Coins} label="Counted £" value={f.counted} onChange={set('counted')} />
        </div>

        {live.variance != null && (
          <div className={`mt-3 rounded-xl p-3 text-center text-sm font-semibold ${live.variance === 0 ? 'bg-success-light text-success-dark' : Math.abs(live.variance) < 0.005 ? 'bg-success-light text-success-dark' : live.variance < 0 ? 'bg-danger-light text-danger-dark' : 'bg-warning-light text-warning-dark'}`}>
            Expected £{live.expectedCash.toFixed(2)} in the drawer ·{' '}
            {Math.abs(live.variance) < 0.005 ? 'balances 🎉' : live.variance < 0 ? `£${Math.abs(live.variance).toFixed(2)} short` : `£${live.variance.toFixed(2)} over`}
          </div>
        )}

        <button type="button" disabled={!canSave} onClick={() => saveDay(f)} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-3 text-sm font-semibold text-white disabled:opacity-40">
          <Check className="h-4 w-4" /> Save today
        </button>
      </div>

      {/* History */}
      {entries.length > 0 && (
        <>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent days</h3>
          <ul className="space-y-2">
            {entries.slice(0, 30).map((e) => {
              const t = entryTotals(e);
              return (
                <li key={e.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-900">{new Date(e.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    {t.variance != null && Math.abs(t.variance) >= 0.005 && (
                      <span className={`block text-[11px] ${t.variance < 0 ? 'text-danger' : 'text-warning-dark'}`}>{t.variance < 0 ? `£${Math.abs(t.variance).toFixed(2)} short` : `£${t.variance.toFixed(2)} over`}</span>
                    )}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-gray-900">£{t.takings.toFixed(2)}</span>
                  <button type="button" onClick={() => removeEntry(e.id)} className="p-1 text-gray-300 hover:text-danger" aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function MoneyField({ icon: Icon, label, value, onChange }) {
  return (
    <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-500">
      <Icon className="h-4 w-4 shrink-0 text-gray-400" />
      <span className="sr-only">{label}</span>
      <input value={value} onChange={onChange} inputMode="decimal" placeholder={label} className="w-full border-none p-0 text-gray-900 placeholder-gray-400 focus:outline-none" />
    </label>
  );
}
