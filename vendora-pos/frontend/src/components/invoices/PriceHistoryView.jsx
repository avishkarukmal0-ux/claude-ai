import React, { useMemo } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { useInvoices } from '../../lib/invoiceStore';
import { useInventory } from '../../lib/inventoryStore';
import { priceHistory } from '../../lib/priceHistory';

// Supplier purchase-price history (Phase 3). From committed invoices only. Shows prev→current cost, the
// source invoice, and flags margin pressure. Estimated gross margin ≠ actual profit. Never changes prices.
const gbp = (v) => `£${(Number(v) || 0).toFixed(2)}`;
const pct = (m) => (m == null ? '—' : `${Math.round(m * 100)}%`);
const d = (ts) => (ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');

export default function PriceHistoryView({ onBack }) {
  const { invoices } = useInvoices();
  const { products } = useInventory();
  const rows = useMemo(() => priceHistory(invoices, products), [invoices, products]);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">Purchase price history</h2>
      <p className="mb-4 text-xs text-gray-400">Confirmed cost changes from your committed invoices. We never change your retail prices.</p>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-gray-50 px-3 py-6 text-center text-sm text-gray-400">No committed invoices yet. Capture &amp; commit invoices (Buy → Supplier invoices) to build price history.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const up = r.changePct != null && r.changePct > 0;
            return (
              <li key={r.productId} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{r.name}</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {r.prev ? <>{gbp(r.prev.unitCost)} → </> : 'first seen '}<b className="text-gray-800">{gbp(r.latest.unitCost)}</b>/unit
                      {r.changePct != null && <span className={`ml-1 font-semibold ${up ? 'text-danger' : 'text-success'}`}>{up ? '+' : ''}{r.changePct}%</span>}
                    </div>
                    <div className="mt-0.5 text-[10px] text-gray-400">{r.latest.supplierName || 'supplier'}{r.latest.invoiceRef ? ` · ${r.latest.invoiceRef}` : ''} · {d(r.latest.date)}</div>
                  </div>
                  <span className={`shrink-0 ${up ? 'text-danger' : 'text-success'}`}>{up ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}</span>
                </div>
                {r.price != null && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                    <span className="text-gray-500">Est. gross margin now <b className="text-gray-800">{pct(r.marginNow)}</b>{r.marginPrev != null && <span className="text-gray-400"> (was {pct(r.marginPrev)})</span>}</span>
                    {r.marginPressure && <span className="inline-flex items-center gap-1 rounded-full bg-warning-light px-1.5 py-0.5 font-semibold text-warning-dark"><AlertTriangle className="h-3 w-3" /> margin pressure</span>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-center text-[11px] text-gray-400">Estimated gross margin = (price − cost) ÷ price. It is not actual profit (which depends on real sales).</p>
    </div>
  );
}
