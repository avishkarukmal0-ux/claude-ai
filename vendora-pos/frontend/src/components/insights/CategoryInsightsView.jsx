import React, { useMemo } from 'react';
import { ArrowLeft, Tags, TrendingUp, PoundSterling } from 'lucide-react';
import { useInventory } from '../../lib/inventoryStore';
import { categoryBreakdown } from '../../lib/insights';
import { readJSON } from '../../lib/storage';

// Category insights — where the money and the stock sit, by category. Confirmed sales only (never
// estimates), over the last 28 days. Builds on the categories added to products.
export default function CategoryInsightsView({ onBack }) {
  const { products } = useInventory();
  const movements = readJSON('movements_v1', []);
  const rows = useMemo(() => categoryBreakdown(products, movements, 28), [products, movements]);

  const totalSales = rows.reduce((n, r) => n + r.salesValue, 0);
  const totalStock = rows.reduce((n, r) => n + r.stockValue, 0);
  const maxSales = rows.reduce((n, r) => Math.max(n, r.salesValue), 0) || 1;

  const gbp = (n) => `£${(Number(n) || 0).toFixed(2)}`;

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Tags className="h-5 w-5" /></span>
        <div>
          <h2 className="text-base font-bold text-gray-900">By category</h2>
          <p className="text-xs text-gray-400">Confirmed sales, last 28 days</p>
        </div>
      </div>

      {products.length === 0 ? (
        <p className="rounded-xl bg-gray-50 px-3 py-6 text-center text-sm text-gray-400">Add some products first — then categories appear here.</p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Stat icon={TrendingUp} label="Sales (28d)" value={gbp(totalSales)} />
            <Stat icon={PoundSterling} label="Stock on shelf" value={gbp(totalStock)} />
          </div>

          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.category} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-gray-900">{r.category}</span>
                  <span className="text-sm font-bold tabular-nums text-gray-900">{gbp(r.salesValue)}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((r.salesValue / maxSales) * 100)}%` }} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-gray-500">
                  <span>{r.products} line{r.products === 1 ? '' : 's'}</span>
                  <span>{r.unitsSold} sold</span>
                  <span>{gbp(r.stockValue)} on shelf</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-[11px] text-gray-400">
            Sales value = confirmed units sold × price. Shelf value counts known-cost stock only.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-400"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className="mt-1 text-xl font-extrabold tabular-nums text-gray-900">{value}</div>
    </div>
  );
}
