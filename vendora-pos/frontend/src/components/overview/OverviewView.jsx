import React from 'react';
import { ArrowLeft, Banknote, TrendingDown, PiggyBank, Package, AlertTriangle, ChevronRight } from 'lucide-react';
import { useTakings, entryTotals } from '../../lib/takingsStore';
import { useWaste } from '../../lib/wasteStore';
import { useInventory, isLowStock } from '../../lib/inventoryStore';

// Owner glance — a real snapshot from the local stores (takings, waste, stock).
// No till or backend needed; the numbers come from what the shop has entered.
export default function OverviewView({ onBack, onOpen }) {
  const { todayEntry, monthTakings } = useTakings();
  const { monthWasted, monthSaved } = useWaste();
  const { products } = useInventory();

  const takingsToday = todayEntry ? entryTotals(todayEntry).takings : 0;
  const lowCount = products.filter(isLowStock).length;
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>

      <h2 className="mb-1 text-base font-bold text-gray-900">Owner glance</h2>
      <p className="mb-4 text-xs text-gray-400">Your shop at a glance — from what you’ve logged. No till needed yet.</p>

      {/* Money row */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Stat label="Takings today" value={`£${takingsToday.toFixed(2)}`} icon={Banknote} tone="text-gray-900" onClick={() => onOpen?.('takings')} />
        <Stat label={`Takings · ${monthName}`} value={`£${monthTakings.toFixed(2)}`} icon={Banknote} tone="text-primary" onClick={() => onOpen?.('takings')} />
      </div>

      {/* Waste row */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Stat label={`Wasted · ${monthName}`} value={`£${monthWasted.toFixed(2)}`} icon={TrendingDown} tone="text-danger" onClick={() => onOpen?.('waste')} />
        <Stat label={`Saved · ${monthName}`} value={`£${monthSaved.toFixed(2)}`} icon={PiggyBank} tone="text-success" onClick={() => onOpen?.('waste')} />
      </div>

      {/* Stock row */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Products" value={String(products.length)} icon={Package} tone="text-gray-900" onClick={() => onOpen?.('stock')} />
        <Stat label="Low stock" value={String(lowCount)} icon={AlertTriangle} tone={lowCount > 0 ? 'text-danger' : 'text-gray-900'} onClick={() => onOpen?.('stock')} />
      </div>

      {takingsToday === 0 && (
        <div className="mt-4 rounded-xl bg-primary-50 p-3 text-sm text-primary-700">
          Log today’s takings to see your real numbers here — tap “Takings today”.
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone, onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md active:scale-[0.98]">
      <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
        <Icon className="h-4 w-4" /> {label}
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-gray-300" />
      </span>
      <span className={`mt-1 text-2xl font-extrabold tabular-nums ${tone}`}>{value}</span>
    </button>
  );
}
