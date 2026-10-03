import React, { useMemo } from 'react';
import {
  ArrowLeft, PackagePlus, ShoppingBag, Trash2, ClipboardCheck, ArrowLeftRight, RotateCcw, Undo2,
} from 'lucide-react';
import { useMovements, movementHistory, reconcileQty, MOVEMENT_TYPES } from '../../lib/movementStore';

const TYPE_META = {
  [MOVEMENT_TYPES.GOODS_RECEIVED]: { label: 'Delivery in', icon: PackagePlus, tone: 'text-success-dark' },
  [MOVEMENT_TYPES.SALE]: { label: 'Sold', icon: ShoppingBag, tone: 'text-gray-700' },
  [MOVEMENT_TYPES.WASTE]: { label: 'Waste', icon: Trash2, tone: 'text-danger' },
  [MOVEMENT_TYPES.CUSTOMER_RETURN]: { label: 'Customer return', icon: Undo2, tone: 'text-success-dark' },
  [MOVEMENT_TYPES.SUPPLIER_RETURN]: { label: 'Returned to supplier', icon: Undo2, tone: 'text-danger' },
  [MOVEMENT_TYPES.TRANSFER]: { label: 'Moved', icon: ArrowLeftRight, tone: 'text-gray-500' },
  [MOVEMENT_TYPES.STOCK_ADJUSTMENT]: { label: 'Adjusted', icon: ClipboardCheck, tone: 'text-primary' },
};

function when(ts) {
  try { return new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

/**
 * Per-product movement history (Phase 1.2c) — "how did the current quantity get here?" Shows every
 * recorded change with who did it, when, why, and a running balance, plus an honest reconciliation line:
 * opening balance (stock present before tracking) + recorded movements = current quantity.
 */
export default function ProductHistory({ product, onBack }) {
  const { records } = useMovements();
  const rows = useMemo(() => movementHistory(records, product.id), [records, product.id]);
  const recon = useMemo(() => reconcileQty(records, product.id, product.qty), [records, product.id, product.qty]);

  return (
    <div>
      {onBack && (
        <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      )}
      <h2 className="text-base font-bold text-gray-900">{product.name}</h2>
      <p className="mb-3 text-xs text-gray-400">Stock movement history</p>

      {/* How the current quantity was reached — honest about any opening balance. */}
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">In stock now</span>
          <span className="font-bold tabular-nums text-gray-900">{recon.currentQty}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
          <span>Recorded movements</span>
          <span className="tabular-nums">{recon.ledgerSum >= 0 ? '+' : ''}{recon.ledgerSum}</span>
        </div>
        {recon.difference !== 0 && (
          <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
            <span>{recon.difference > 0 ? 'Opening balance (before tracking)' : 'Unexplained (stock left without a movement)'}</span>
            <span className="tabular-nums">{recon.difference > 0 ? '+' : ''}{recon.difference}</span>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-500 shadow-sm">
          No movements recorded yet. Deliveries, counts, waste and corrections will show here with who did them.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const meta = TYPE_META[r.type] || { label: r.type, icon: ClipboardCheck, tone: 'text-gray-500' };
            const Icon = r.reversalOf ? RotateCcw : meta.icon;
            const up = r.delta > 0;
            return (
              <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-50 ${meta.tone}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{r.reversalOf ? 'Reversal' : meta.label}</span>
                    <span className={`text-xs font-bold tabular-nums ${up ? 'text-success-dark' : 'text-danger'}`}>{up ? '+' : ''}{r.delta}</span>
                  </div>
                  <div className="truncate text-[11px] text-gray-400">
                    {when(r.at)}{r.actor ? ` · ${r.actor}` : ''}{r.reason ? ` · ${r.reason}` : ''}
                  </div>
                </div>
                <span className="shrink-0 text-right">
                  <span className="block text-[10px] uppercase tracking-wide text-gray-300">balance</span>
                  <span className="block text-sm font-semibold tabular-nums text-gray-700">{r.balance}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
