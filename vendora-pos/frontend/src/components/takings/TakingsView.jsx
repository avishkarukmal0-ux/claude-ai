import React, { useState, useEffect } from 'react';
import { Banknote, CreditCard, Coins, Wallet, Trash2, Check } from 'lucide-react';
import ScreenBack from '../common/ScreenBack';
import { useTakings, entryTotals } from '../../lib/takingsStore';
import { parseMoneyInput } from '../../lib/numberInput';

const MONEY_FIELDS = ['card', 'cash', 'float', 'counted', 'passThrough'];
const FIELD_LABEL = { card: 'Card', cash: 'Cash', float: 'Float', counted: 'Counted', passThrough: 'Pass-through' };

// Takings & cash-up — enter the day's card + cash takings and count the drawer.
// Shows total takings + cash variance. Local-first; feeds the Owner glance.
export default function TakingsView({ onBack }) {
  const { entries, saveDay, removeEntry, todayEntry, monthTakings } = useTakings();
  const [f, setF] = useState({ card: '', cash: '', float: '', passThrough: '', counted: '' });

  // Prefill from today's saved record if there is one.
  useEffect(() => {
    if (todayEntry) {
      setF({
        card: String(todayEntry.card ?? ''),
        cash: String(todayEntry.cash ?? ''),
        float: String(todayEntry.float ?? ''),
        passThrough: todayEntry.passThrough ? String(todayEntry.passThrough) : '',
        counted: todayEntry.counted == null ? '' : String(todayEntry.counted),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  // Validate like the product form: accept "1,20", reject text/negatives inline, keep what was typed.
  const parsed = Object.fromEntries(MONEY_FIELDS.map((k) => [k, parseMoneyInput(f[k])]));
  // Name the field in the message, e.g. "Card: enter a number, e.g. 1.20".
  const errors = Object.fromEntries(MONEY_FIELDS.map((k) => {
    const e = parsed[k].error;
    return [k, e ? `${FIELD_LABEL[k]}: ${e.charAt(0).toLowerCase()}${e.slice(1)}` : null];
  }));
  const anyError = MONEY_FIELDS.some((k) => errors[k]);
  // Totals + the saved record run off the PARSED values, so "1,20" isn't silently read as £0.
  const pf = {
    card: parsed.card.value ?? '', cash: parsed.cash.value ?? '', float: parsed.float.value ?? '',
    passThrough: parsed.passThrough.value ?? '', counted: parsed.counted.value == null ? '' : parsed.counted.value,
  };
  const live = entryTotals(pf);
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });
  const canSave = !anyError && (parsed.card.value != null || parsed.cash.value != null);

  return (
    <div>
      <ScreenBack onBack={onBack} />

      <h2 className="mb-1 text-base font-bold text-gray-900">Takings &amp; cash-up</h2>
      <p className="mb-4 text-xs text-gray-400">Log the day’s takings and count the drawer. No till needed.</p>

      {/* Live totals */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm" role="status">
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
        <div className="mb-2 grid grid-cols-2 items-start gap-2">
          <MoneyField id="tk-card" icon={CreditCard} label="Card £" value={f.card} onChange={set('card')} error={errors.card} />
          <MoneyField id="tk-cash" icon={Banknote} label="Cash £" value={f.cash} onChange={set('cash')} error={errors.cash} />
        </div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Cash-up</div>
        <div className="grid grid-cols-2 items-start gap-2">
          <MoneyField id="tk-float" icon={Wallet} label="Float £" value={f.float} onChange={set('float')} error={errors.float} help="Cash in the drawer when you opened" />
          <MoneyField id="tk-counted" icon={Coins} label="Counted £" value={f.counted} onChange={set('counted')} error={errors.counted} help="Cash in the drawer now" />
        </div>
        <div className="mt-2">
          <MoneyField id="tk-pass" icon={Banknote} label="Pass-through £ (bill pay / lottery / top-ups)" value={f.passThrough} onChange={set('passThrough')} error={errors.passThrough} />
        </div>

        {live.variance != null && (
          <div role="status" className={`mt-3 rounded-xl p-3 text-center text-sm font-semibold ${Math.abs(live.variance) < 0.005 ? 'bg-success-light text-success-dark' : live.variance < 0 ? 'bg-danger-light text-danger-dark' : 'bg-warning-light text-warning-dark'}`}>
            Expected £{live.expectedCash.toFixed(2)} in the drawer ·{' '}
            {Math.abs(live.variance) < 0.005 ? 'balances 🎉' : live.variance < 0 ? `£${Math.abs(live.variance).toFixed(2)} short` : `£${live.variance.toFixed(2)} over`}
          </div>
        )}

        <button type="button" disabled={!canSave} onClick={() => saveDay(pf)} aria-describedby={!canSave ? 'save-hint' : undefined} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-3 text-sm font-semibold text-white disabled:opacity-40">
          <Check className="h-4 w-4" /> Save today
        </button>
        {!canSave && (
          <p id="save-hint" className="mt-2 text-center text-xs text-gray-400">{anyError ? 'Fix the highlighted amounts to save.' : 'Enter today’s card or cash takings to save.'}</p>
        )}
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
                      <span className={`block text-xs ${t.variance < 0 ? 'text-danger' : 'text-warning-dark'}`}>{t.variance < 0 ? `£${Math.abs(t.variance).toFixed(2)} short` : `£${t.variance.toFixed(2)} over`}</span>
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

function MoneyField({ id, icon: Icon, label, value, onChange, error, help }) {
  const describedBy = [error ? `${id}-err` : null, help && !error ? `${id}-help` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2.5 text-sm text-gray-500 ${error ? 'border-danger/60' : 'border-gray-200'}`}>
        <Icon className="h-4 w-4 shrink-0 text-gray-400" />
        <span className="sr-only">{label}</span>
        <input value={value} onChange={onChange} inputMode="decimal" placeholder={label} aria-label={label} aria-invalid={!!error} aria-describedby={describedBy} className="w-full border-none bg-transparent p-0 text-gray-900 placeholder-gray-400 focus:outline-none" />
      </label>
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-0.5 px-1 text-xs font-medium text-danger-dark">{error}</p>
      ) : help ? (
        <p id={`${id}-help`} className="mt-0.5 px-1 text-xs text-gray-400">{help}</p>
      ) : null}
    </div>
  );
}
