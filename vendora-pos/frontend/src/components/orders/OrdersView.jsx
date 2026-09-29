import React, { useMemo } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, ShoppingCart, Plus, Minus, Check, X, Share2, Building2, Truck } from 'lucide-react';
import { useOrders, orderTotals, statusFor, OPEN_STATUSES } from '../../lib/orderStore';

const STATUS_LABEL = {
  draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-500' },
  ordered: { label: 'Ordered', cls: 'bg-primary-50 text-primary' },
  partially_received: { label: 'Part-received', cls: 'bg-warning-light text-warning-dark' },
  received: { label: 'Received', cls: 'bg-success-light text-success-dark' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-400' },
};
const money = (v) => `£${(Number(v) || 0).toFixed(2)}`;

async function shareOrder(order) {
  const lines = (order.lines || []).map((l) => `• ${l.name} x${l.qty}`);
  const text = `Order — ${order.supplierName || 'supplier'}\n${lines.join('\n')}\n\n— via Vendora`;
  try { if (navigator.share) { await navigator.share({ title: 'Order', text }); return; } } catch { /* fall through */ }
  try { await navigator.clipboard.writeText(text); toast.success('Order copied — paste to your supplier'); return; } catch { /* ignore */ }
  toast('Couldn’t copy automatically', { icon: 'ℹ️' });
}

// Stage 5a — purchase orders with a lifecycle. Receiving stock happens on the Scan tab (a
// delivery can be linked to an order); here you can also tick off what's arrived line by line.
export default function OrdersView({ onBack }) {
  const { orders, cancelOrder, removeOrder, receiveAgainst, markReceived } = useOrders();

  const open = useMemo(() => orders.filter((o) => OPEN_STATUSES.includes(statusFor(o))), [orders]);
  const done = useMemo(() => orders.filter((o) => !OPEN_STATUSES.includes(statusFor(o))).sort((a, b) => (b.receivedAt || b.createdAt) - (a.receivedAt || a.createdAt)).slice(0, 12), [orders]);

  function OrderCard({ o, interactive }) {
    const t = orderTotals(o);
    const st = statusFor(o);
    const meta = STATUS_LABEL[st] || STATUS_LABEL.ordered;
    return (
      <li className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{o.supplierName || 'Supplier'}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span>
        </div>
        <div className="mb-2 text-[11px] text-gray-500">{t.received}/{t.ordered} units received · {money(t.cost)}</div>
        <ul className="space-y-1.5">
          {(o.lines || []).map((l) => {
            const remaining = Math.max(0, (Number(l.qty) || 0) - (Number(l.receivedQty) || 0));
            return (
              <li key={l.id} className="flex items-center gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate text-gray-800">{l.name}</span>
                <span className={`tabular-nums ${remaining === 0 ? 'text-success' : 'text-gray-500'}`}>{l.receivedQty || 0}/{l.qty}</span>
                {interactive && remaining > 0 && (
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => receiveAgainst(o.id, [{ productId: l.productId, barcode: l.barcode, qty: 1 }])} className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-50 text-primary active:scale-95" aria-label={`Receive one ${l.name}`}><Plus className="h-3.5 w-3.5" /></button>
                  </span>
                )}
                {interactive && (Number(l.receivedQty) || 0) > 0 && (
                  <button type="button" onClick={() => receiveAgainst(o.id, [{ productId: l.productId, barcode: l.barcode, qty: -1 }])} className="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-100 text-gray-500 active:scale-95" aria-label={`Un-receive one ${l.name}`}><Minus className="h-3.5 w-3.5" /></button>
                )}
              </li>
            );
          })}
        </ul>
        {interactive && (
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => shareOrder(o)} className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 active:scale-95"><Share2 className="h-3.5 w-3.5" /> Share</button>
            <button type="button" onClick={() => markReceived(o.id)} className="flex items-center gap-1 rounded-lg bg-success px-2.5 py-1.5 text-[11px] font-semibold text-white active:scale-95"><Check className="h-3.5 w-3.5" /> All received</button>
            <button type="button" onClick={() => { if (confirm('Cancel this order?')) cancelOrder(o.id); }} className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-gray-400 hover:text-danger"><X className="h-3.5 w-3.5" /> Cancel</button>
          </div>
        )}
      </li>
    );
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">Orders</h2>
      <p className="mb-4 text-xs text-gray-400">Place orders from your buy list, then tick off what arrives. Receiving stock happens on the Scan tab.</p>

      {open.length === 0 && done.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><ShoppingCart className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">No orders yet</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Build a buy list, then tap “Place order” on a supplier group to start tracking it here.</p>
        </div>
      ) : (
        <>
          {open.length > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400"><Truck className="h-3.5 w-3.5" /> Open orders</h3>
              <ul className="space-y-2">{open.map((o) => <OrderCard key={o.id} o={o} interactive />)}</ul>
            </section>
          )}
          {done.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent</h3>
              <ul className="space-y-2">{done.map((o) => <OrderCard key={o.id} o={o} interactive={false} />)}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
