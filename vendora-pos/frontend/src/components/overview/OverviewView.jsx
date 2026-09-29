import React, { useMemo } from 'react';
import { ArrowLeft, Banknote, TrendingDown, PiggyBank, Package, AlertTriangle, ChevronRight, Boxes, Hourglass, LineChart, Percent, Trophy } from 'lucide-react';
import { useTakings, entryTotals } from '../../lib/takingsStore';
import { useWaste } from '../../lib/wasteStore';
import { useInventory, isLowStock } from '../../lib/inventoryStore';
import { useMovements } from '../../lib/movementStore';
import { stockValue, slowStockValue, projectedWeeklySales, avgMargin, bestSellers } from '../../lib/insights';

// Owner glance — a real snapshot from the local stores (takings, waste, stock,
// sell-through). No till or backend needed; the numbers come from what the shop
// has entered and how stock has moved.
export default function OverviewView({ onBack, onOpen }) {
  const { todayEntry, monthTakings } = useTakings();
  const { monthWasted, monthSaved } = useWaste();
  const { products } = useInventory();
  const { records } = useMovements();

  const takingsToday = todayEntry ? entryTotals(todayEntry).takings : 0;
  const lowCount = products.filter(isLowStock).length;
  const monthName = new Date().toLocaleDateString('en-GB', { month: 'long' });

  const insights = useMemo(() => ({
    stock: stockValue(products),
    slow: slowStockValue(products),
    projected: projectedWeeklySales(products, records),
    margin: avgMargin(products),
    top: bestSellers(products, records, 28, 5),
  }), [products, records]);

  const topMax = insights.top.reduce((m, t) => Math.max(m, t.units), 0) || 1;

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
      <div className="mb-3 grid grid-cols-2 gap-3">
        <Stat label="Products" value={String(products.length)} icon={Package} tone="text-gray-900" onClick={() => onOpen?.('stock')} />
        <Stat label="Low stock" value={String(lowCount)} icon={AlertTriangle} tone={lowCount > 0 ? 'text-danger' : 'text-gray-900'} onClick={() => onOpen?.('stock')} />
      </div>

      {/* Capital row — money on the shelves vs money stuck */}
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Stock value" value={`£${insights.stock.toFixed(0)}`} icon={Boxes} tone="text-gray-900" onClick={() => onOpen?.('stock')} />
        <Stat label="Not moving" value={`£${insights.slow.toFixed(0)}`} icon={Hourglass} tone={insights.slow > 0 ? 'text-warning' : 'text-gray-900'} onClick={() => onOpen?.('deadstock')} />
      </div>

      {/* Forward view — only once we have enough sell-through to project */}
      {(insights.projected != null || insights.margin != null) && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {insights.projected != null && (
            <Stat label="Expected sales/wk" value={`£${insights.projected.toFixed(0)}`} icon={LineChart} tone="text-primary" hint="At current pace" />
          )}
          {insights.margin != null && (
            <Stat label="Avg margin" value={`${Math.round(insights.margin * 100)}%`} icon={Percent} tone="text-success" hint="Weighted by value" />
          )}
        </div>
      )}

      {/* Best sellers — the shop's engine, last 28 days */}
      {insights.top.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <Trophy className="h-3.5 w-3.5" /> Best sellers · 28 days
          </h3>
          <ul className="space-y-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
            {insights.top.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3">
                <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-gray-400">{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="mb-1 block truncate text-sm font-medium text-gray-900">{t.name}</span>
                  <span className="block h-1.5 rounded-full bg-primary/70" style={{ width: `${Math.max(8, (t.units / topMax) * 100)}%` }} />
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-gray-500">{t.units} sold</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {takingsToday === 0 && (
        <div className="mt-4 rounded-xl bg-primary-50 p-3 text-sm text-primary-700">
          Log today’s takings to see your real numbers here — tap “Takings today”.
        </div>
      )}
      {insights.top.length === 0 && (
        <p className="mt-4 text-center text-[11px] text-gray-400">
          Best sellers &amp; projections appear as you sell stock (adjust quantities down as things sell).
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone, onClick, hint }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex flex-col rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm ${onClick ? 'transition hover:border-primary/40 hover:shadow-md active:scale-[0.98]' : ''}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400">
        <Icon className="h-4 w-4" /> {label}
        {onClick && <ChevronRight className="ml-auto h-3.5 w-3.5 text-gray-300" />}
      </span>
      <span className={`mt-1 text-2xl font-extrabold tabular-nums ${tone}`}>{value}</span>
      {hint && <span className="mt-0.5 text-[10px] font-medium text-gray-400">{hint}</span>}
    </Tag>
  );
}
