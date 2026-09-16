import React, { useMemo, useState } from 'react';
import { ArrowLeft, Hourglass, Minus, Plus, Trash2 } from 'lucide-react';
import { useInventory, isSlowStock, daysSinceMovement } from '../../lib/inventoryStore';

// Slow / dead stock — capital tied up in lines that aren't moving. The opposite of
// low-stock: surfaces what to mark down or clear. "Sold" = any qty decrease.
const THRESHOLDS = [14, 30, 60];

export default function DeadStockView({ onBack }) {
  const { products, updateProduct, removeProduct } = useInventory();
  const [days, setDays] = useState(30);

  const slow = useMemo(
    () => products.filter((p) => isSlowStock(p, days)).sort((a, b) => (daysSinceMovement(b) || 0) - (daysSinceMovement(a) || 0)),
    [products, days]
  );
  const deadCapital = slow.reduce((s, p) => s + (Number(p.cost) || 0) * (Number(p.qty) || 0), 0);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>

      <h2 className="mb-1 text-base font-bold text-gray-900">Slow stock</h2>
      <p className="mb-4 text-xs text-gray-400">Lines that aren’t selling — money sitting on the shelf. Mark down or clear.</p>

      {/* Threshold + dead capital */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-1">
          {THRESHOLDS.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${days === d ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
              {d}d+
            </button>
          ))}
        </div>
        <div className="rounded-xl bg-warning-light px-3 py-2 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-warning-dark">Tied up</div>
          <div className="text-lg font-extrabold tabular-nums text-warning-dark">£{deadCapital.toFixed(2)}</div>
        </div>
      </div>

      {slow.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-light text-success-dark">
            <Hourglass className="h-7 w-7" strokeWidth={1.75} />
          </span>
          <p className="text-sm font-semibold text-gray-900">Nothing’s gone stale</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">No lines have sat {days}+ days without a sale. (Selling logs when stock goes down.)</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {slow.map((p) => {
            const d = daysSinceMovement(p);
            const neverSold = !p.lastSoldAt;
            return (
              <li key={p.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{p.name}</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {neverSold ? `Never sold · ${d}d in stock` : `${d}d since last sold`}
                      {Number(p.cost) > 0 && <span> · £{((Number(p.cost) || 0) * (Number(p.qty) || 0)).toFixed(2)} tied up</span>}
                    </div>
                  </div>
                  <button type="button" onClick={() => removeProduct(p.id)} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-end gap-3">
                  <span className="mr-auto text-[11px] text-gray-400">Sold some? Count it down →</span>
                  <button type="button" onClick={() => updateProduct(p.id, { qty: Math.max(0, (Number(p.qty) || 0) - 1) })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600 active:scale-95" aria-label="Decrease">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-base font-bold tabular-nums text-gray-900">{Number(p.qty) || 0}</span>
                  <button type="button" onClick={() => updateProduct(p.id, { qty: (Number(p.qty) || 0) + 1 })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary active:scale-95" aria-label="Increase">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
