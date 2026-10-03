import React from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, BadgePercent, ArrowRight, Check, X, TrendingUp, TrendingDown } from 'lucide-react';
import { usePriceAlerts } from '../../lib/priceAlertStore';
import { useInventory } from '../../lib/inventoryStore';

const money = (v) => (v == null ? '—' : `£${(Number(v) || 0).toFixed(2)}`);
const pct = (m) => (m == null ? '—' : `${Math.round(m * 100)}%`);

// Stage 5c — purchase-price change queue. Cost rises/falls from deliveries surface here with the
// margin impact and a suggested retail to hold the old margin. Retail is only ever changed when
// the owner approves it here — never automatically.
export default function PriceAlertsView({ onBack }) {
  const { openAlerts, dismiss, markApproved } = usePriceAlerts();
  const { updateProduct } = useInventory();

  function approve(a) {
    if (a.suggestedRetail == null) { toast('No suggested retail — set a price in Stock'); return; }
    updateProduct(a.productId, { price: a.suggestedRetail, reason: 'retail approved after cost change' });
    markApproved(a.id);
    toast.success(`Retail set to ${money(a.suggestedRetail)}`);
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">Price changes</h2>
      <p className="mb-4 text-xs text-gray-400">When a supplier’s cost moves, review the margin hit here. Retail prices only change when you approve them.</p>

      {openAlerts.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><BadgePercent className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">No price changes to review</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Receive a delivery whose cost has changed and it’ll appear here for review.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {openAlerts.map((a) => {
            const up = a.newCost > a.prevCost;
            return (
              <li key={a.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="mb-1 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{a.name}</span>
                  <span className={`flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${up ? 'bg-danger/10 text-danger' : 'bg-success-light text-success-dark'}`}>
                    {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{a.changePct > 0 ? '+' : ''}{a.changePct}%
                  </span>
                </div>
                <div className="mb-1 flex items-center gap-2 text-[12px] text-gray-600">
                  cost {money(a.prevCost)} <ArrowRight className="h-3.5 w-3.5 text-gray-400" /> <span className="font-semibold text-gray-900">{money(a.newCost)}</span>
                </div>
                <div className="mb-2 text-[11px] text-gray-500">
                  margin {pct(a.prevMargin)} <ArrowRight className="inline h-3 w-3 text-gray-400" /> <span className={a.newMargin != null && a.prevMargin != null && a.newMargin < a.prevMargin ? 'font-semibold text-danger' : 'font-semibold text-gray-700'}>{pct(a.newMargin)}</span>
                  {a.suggestedRetail != null && <> · hold margin at retail <span className="font-semibold text-gray-900">{money(a.suggestedRetail)}</span></>}
                </div>
                <div className="flex items-center gap-2">
                  {a.suggestedRetail != null && (
                    <button type="button" onClick={() => approve(a)} className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white active:scale-95"><Check className="h-3.5 w-3.5" /> Set retail {money(a.suggestedRetail)}</button>
                  )}
                  <button type="button" onClick={() => dismiss(a.id)} className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 active:scale-95"><X className="h-3.5 w-3.5" /> Keep price</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
