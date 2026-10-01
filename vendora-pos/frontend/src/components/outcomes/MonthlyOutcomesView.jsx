import React, { useMemo } from 'react';
import { ArrowLeft, PiggyBank, Receipt, ClipboardCheck, CheckCircle2, TrendingDown, Info, CalendarClock } from 'lucide-react';
import { useClaims } from '../../lib/claimStore';
import { useTasks } from '../../lib/taskStore';
import { useInventory } from '../../lib/inventoryStore';
import { useStocktake } from '../../lib/stocktakeStore';
import { useWaste } from '../../lib/wasteStore';
import { monthlyOutcomes } from '../../lib/outcomes';

const money = (v) => `£${(Number(v) || 0).toFixed(2)}`;

// Later addition — monthly outcomes. Reports what ACTUALLY happened (credit received, discrepancies
// resolved, tasks done, stock-check coverage, waste cost). Estimated savings are shown separately.
export default function MonthlyOutcomesView({ onBack }) {
  const { claims } = useClaims();
  const { tasks } = useTasks();
  const { products } = useInventory();
  const { history } = useStocktake();
  const { monthWasted, monthSaved } = useWaste();

  const o = useMemo(() => monthlyOutcomes({ claims, tasks, products, stocktakeHistory: history, monthWasted, monthSaved, now: Date.now() }),
    [claims, tasks, products, history, monthWasted, monthSaved]);
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  // Nothing recorded yet this month AND no catalogue — show a useful empty state rather than a wall of £0.00.
  const isEmpty = o.coverageTotal === 0 && o.creditReceived === 0 && o.creditOutstanding === 0
    && o.discrepanciesResolved === 0 && o.tasksCompleted === 0 && o.stockChecks === 0
    && o.wasteCost === 0 && o.estimated.rescued === 0;

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">This month</h2>
      <p className="mb-4 text-xs text-gray-400">{monthName} — what actually happened, from your records.</p>

      {isEmpty && (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
            <CalendarClock className="h-7 w-7" strokeWidth={1.75} />
          </span>
          <p className="text-sm font-semibold text-gray-900">Nothing recorded yet this month</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">
            As you count stock, resolve claims, receive credit and complete tasks, the real figures appear
            here — pulled from your records, never estimated.
          </p>
        </div>
      )}

      {!isEmpty && (
      <>
      <div className="grid grid-cols-2 gap-3">
        <Stat icon={PiggyBank} tone="text-success" label="Credit received" value={money(o.creditReceived)} hint={o.creditOutstanding > 0 ? `${money(o.creditOutstanding)} still chasing` : undefined} />
        <Stat icon={Receipt} tone="text-gray-900" label="Claims resolved" value={String(o.discrepanciesResolved)} />
        <Stat icon={CheckCircle2} tone="text-gray-900" label="Tasks completed" value={String(o.tasksCompleted)} />
        <Stat icon={ClipboardCheck} tone="text-gray-900" label="Stock checks" value={String(o.stockChecks)} />
        <Stat icon={TrendingDown} tone="text-danger" label="Waste cost" value={money(o.wasteCost)} />
        <Stat icon={ClipboardCheck} tone="text-gray-900" label="Count coverage" value={`${o.coveragePct}%`} hint={`${o.coverageCounted}/${o.coverageTotal} products`} />
      </div>

      {/* Coverage bar */}
      {o.coverageTotal > 0 && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-gray-400"><span>Stock counted this month</span><span>{o.coveragePct}%</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-primary" style={{ width: `${o.coveragePct}%` }} /></div>
        </div>
      )}

      {/* Estimated — kept clearly separate from actuals */}
      <div className="mt-5 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400"><Info className="h-3.5 w-3.5" /> Estimated (not confirmed)</div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Waste rescued by marking down in time</span>
          <span className="font-bold tabular-nums text-gray-700">{money(o.estimated.rescued)}</span>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-gray-400">An estimate of value kept out of the bin — separate from the confirmed figures above.</p>
      </div>
      </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone, hint }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><Icon className="h-4 w-4" /> {label}</span>
      <span className={`mt-1 block text-2xl font-extrabold tabular-nums ${tone}`}>{value}</span>
      {hint && <span className="mt-0.5 block text-[10px] font-medium text-gray-400">{hint}</span>}
    </div>
  );
}
