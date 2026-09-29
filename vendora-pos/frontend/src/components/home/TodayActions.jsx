import React, { useMemo } from 'react';
import { AlertOctagon, TrendingDown, ShoppingCart, Hourglass, Coins, ChevronRight, CheckCircle2, ListChecks } from 'lucide-react';
import { useInventory } from '../../lib/inventoryStore';
import { useMovements } from '../../lib/movementStore';
import { useTakings } from '../../lib/takingsStore';
import { buildActions } from '../../lib/actionEngine';

const KIND_ICON = {
  pull: AlertOctagon,
  markdown: TrendingDown,
  reorder: ShoppingCart,
  deadstock: Hourglass,
  cashup: Coins,
};

// Per-severity styling: the row's left rail, icon tint, and money-chip colour.
const SEVERITY = {
  critical: { rail: 'border-l-danger', iconWrap: 'bg-danger/10 text-danger', chip: 'bg-danger/10 text-danger' },
  warn:     { rail: 'border-l-amber-500', iconWrap: 'bg-amber-100 text-amber-700', chip: 'bg-amber-100 text-amber-700' },
  info:     { rail: 'border-l-primary/50', iconWrap: 'bg-primary-50 text-primary', chip: 'bg-primary-50 text-primary' },
};

/**
 * "Do this today" — the brain's output on the home screen. Reads the live local
 * stores, runs the action engine, and renders a short prioritised task list.
 * Each row jumps straight to the screen that fixes it via onGo({ screen | tab }).
 */
export default function TodayActions({ onGo }) {
  const { products } = useInventory();
  const { records } = useMovements();
  const { todayEntry } = useTakings();

  const actions = useMemo(
    () => buildActions({ products, records, todayEntry, now: new Date() }),
    [products, records, todayEntry],
  );

  // Nothing to do — but only celebrate once there's actually stock to reason about.
  if (actions.length === 0) {
    if (products.length === 0) return null; // fresh install: let the promises card lead instead
    return (
      <section className="mb-5 flex items-center gap-3 rounded-2xl border border-success-light bg-success-light/40 p-4">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-success" />
        <div>
          <p className="text-sm font-semibold text-success-dark">You’re all caught up</p>
          <p className="text-[11px] text-success-dark/80">Nothing urgent right now. Nice one.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-5">
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
        <ListChecks className="h-3.5 w-3.5" /> Do this today
      </h2>
      <ul className="space-y-2">
        {actions.map((a) => {
          const Icon = KIND_ICON[a.kind] || ShoppingCart;
          const s = SEVERITY[a.severity] || SEVERITY.info;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onGo?.(a.go)}
                className={`flex w-full items-center gap-3 rounded-2xl border border-gray-100 border-l-4 ${s.rail} bg-white p-3 text-left shadow-sm transition hover:shadow-md active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${s.iconWrap}`}>
                  <Icon className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-gray-900">{a.title}</span>
                    {a.money ? (
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${s.chip}`}>{a.money}</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-gray-500">{a.detail}</span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-primary">
                  {a.cta} <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
