import React, { useMemo } from 'react';
import { ArrowLeft, Scale, Building2, TrendingDown, AlertTriangle, Info } from 'lucide-react';
import { useInvoices } from '../../lib/invoiceStore';
import { useInventory } from '../../lib/inventoryStore';
import { useSuppliers } from '../../lib/supplierStore';
import { useDeliveries } from '../../lib/deliveryStore';
import { useClaims } from '../../lib/claimStore';
import { compareSuppliersForProduct, supplierScorecards } from '../../lib/supplierInsights';

const money = (v) => `£${(Number(v) || 0).toFixed(2)}`;
const day = (t) => (t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Buying decisions (Phase 5) — compares what suppliers actually charged (per single unit, from committed
// invoices) and shows reliability facts. No "best supplier" ranking; gaps are explained, not guessed.
export default function SupplierInsightsView({ onBack }) {
  const { invoices } = useInvoices();
  const { products } = useInventory();
  const { suppliers } = useSuppliers();
  const { deliveries } = useDeliveries();
  const { claims } = useClaims();

  const comparisons = useMemo(
    () => products.map((p) => compareSuppliersForProduct(invoices, p)).filter((c) => c.rows.length > 0),
    [products, invoices],
  );
  const multi = comparisons.filter((c) => c.rows.length > 1).slice(0, 30);
  const single = comparisons.length - comparisons.filter((c) => c.rows.length > 1).length;
  const cards = useMemo(() => supplierScorecards({ suppliers, deliveries, claims, invoices }), [suppliers, deliveries, claims, invoices]);

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">Compare suppliers</h2>
      <p className="mb-4 text-xs text-gray-400">Equivalent per-unit costs from your committed invoices, plus how each supplier has performed. Costs only — add delivery charges yourself where they matter.</p>

      {comparisons.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Scale className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">No confirmed costs yet</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Capture and commit a supplier invoice, and the per-unit costs will appear here to compare.</p>
        </div>
      ) : (
        <>
          <section className="mb-5">
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400"><Scale className="h-3.5 w-3.5" /> Same product, different suppliers</h3>
            {multi.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-3 text-[12px] text-gray-500">No product has a confirmed cost from more than one supplier yet — nothing to compare. {single > 0 && `${single} product(s) have a single supplier on record.`}</p>
            ) : (
              <ul className="space-y-2">
                {multi.map((c) => (
                  <li key={c.productId} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900">{c.name}</span>
                      {c.saving > 0 && <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-success-light px-2 py-0.5 text-[10px] font-semibold text-success-dark"><TrendingDown className="h-3 w-3" /> save {money(c.saving)}/unit</span>}
                    </div>
                    <ul className="space-y-1">
                      {c.rows.map((r, i) => (
                        <li key={r.supplierName} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[12px] ${i === 0 ? 'bg-success-light/50' : ''}`}>
                          <span className="min-w-0 truncate text-gray-700">{r.supplierName}<span className="text-gray-400"> · {r.invoiceRef || 'inv'} · {day(r.date)}</span></span>
                          <span className="shrink-0 font-bold tabular-nums text-gray-900">{money(r.effectiveUnitCost)}<span className="font-normal text-gray-400">/unit</span></span>
                        </li>
                      ))}
                    </ul>
                    {c.note && <p className="mt-1 flex items-start gap-1 text-[10px] text-gray-400"><Info className="mt-0.5 h-3 w-3 shrink-0" /> {c.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {cards.length > 0 && (
            <section>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400"><Building2 className="h-3.5 w-3.5" /> Supplier reliability</h3>
              <ul className="space-y-2">
                {cards.map((s) => (
                  <li key={s.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900">{s.name}</span>
                      {s.committedSpend > 0 && <span className="shrink-0 text-[11px] text-gray-400">{money(s.committedSpend)} invoiced</span>}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-600">
                      <span>{s.deliveries} deliveries</span>
                      {s.shortageRate != null && <span className={s.shortageRate > 0 ? 'text-warning-dark' : ''}>{s.withShortage} with shortages ({s.shortageRate}%)</span>}
                      <span>{s.claims} claims{s.settled ? ` · ${s.settled} settled` : ''}</span>
                      {s.avgTurnaroundDays != null && <span>credit in ~{s.avgTurnaroundDays}d</span>}
                    </div>
                    {s.missing.length > 0 && <p className="mt-1 flex items-start gap-1 text-[10px] text-gray-400"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> Limited data: {s.missing.join('; ')}.</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
