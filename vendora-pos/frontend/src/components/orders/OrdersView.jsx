import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ShoppingCart, Plus, Minus, Check, X, Share2, Building2, Truck, Send } from 'lucide-react';
import ScreenBack from '../common/ScreenBack';
import ConfirmDialog from '../common/ConfirmDialog';
import { useOrders, orderTotals, statusFor, OPEN_STATUSES } from '../../lib/orderStore';
import { useInventory } from '../../lib/inventoryStore';

const STATUS_LABEL = {
  draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-500' },
  ordered: { label: 'Ordered', cls: 'bg-primary-50 text-primary' },
  partially_received: { label: 'Part-received', cls: 'bg-warning-light text-warning-dark' },
  received: { label: 'Received', cls: 'bg-success-light text-success-dark' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-400' },
};
const money = (v) => { const n = Number(v) || 0; return n < 0 ? `-£${Math.abs(n).toFixed(2)}` : `£${n.toFixed(2)}`; };

async function shareOrder(order) {
  const lines = (order.lines || []).map((l) => `• ${l.name} x${l.qty}`);
  const text = `Order — ${order.supplierName || 'supplier'}\n${lines.join('\n')}\n\n— via Vendora`;
  try { if (navigator.share) { await navigator.share({ title: 'Order', text }); return; } } catch { /* fall through */ }
  try { await navigator.clipboard.writeText(text); toast.success('Order copied — paste to your supplier'); return; } catch { /* ignore */ }
  toast('Couldn’t copy automatically', { icon: 'ℹ️' });
}

// Stage 5a — purchase orders with a lifecycle. Receiving stock happens on the Scan tab (a delivery can be
// linked to an order); here you TRACK what's arrived — ticking a line does NOT change stock (book in on Scan).
export default function OrdersView({ onBack }) {
  const { orders, cancelOrder, removeOrder, restoreOrder, receiveAgainst, markReceived, sendOrder } = useOrders();
  const { products } = useInventory();
  const [confirm, setConfirm] = useState(null); // { kind:'cancel'|'delete', order }

  // Estimate an order's value from each line's cost, falling back to the product's cost price when the line
  // didn't carry one (so the card shows a real figure, not £0.00). Returns { value, estimated }.
  const costOf = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    const byBarcode = new Map(products.filter((p) => p.barcode).map((p) => [p.barcode, p]));
    return (o) => {
      let value = 0; let estimated = false;
      for (const l of o.lines || []) {
        const qty = Number(l.qty) || 0;
        let unit = Number(l.cost);
        if (!(unit > 0)) { const p = byId.get(l.productId) || byBarcode.get(l.barcode); if (p && Number(p.cost) > 0) { unit = Number(p.cost); estimated = true; } }
        value += (unit > 0 ? unit : 0) * qty;
      }
      return { value, estimated };
    };
  }, [products]);

  const drafts = useMemo(() => orders.filter((o) => statusFor(o) === 'draft'), [orders]);
  const open = useMemo(() => orders.filter((o) => OPEN_STATUSES.includes(statusFor(o))), [orders]);
  const done = useMemo(() => orders.filter((o) => { const s = statusFor(o); return s !== 'draft' && !OPEN_STATUSES.includes(s); })
    .sort((a, b) => (b.receivedAt || b.createdAt) - (a.receivedAt || a.createdAt)).slice(0, 12), [orders]);

  function receiveOne(o, l, delta) {
    receiveAgainst(o.id, [{ productId: l.productId, barcode: l.barcode, qty: delta }]);
    if (delta > 0) toast(`Marked 1 ${l.name} arrived — book in on Scan to change stock`, { icon: '📦' });
  }
  const undoToast = (label, order) => toast((tst) => (
    <span className="flex items-center gap-3 text-sm">{label}
      <button type="button" onClick={() => { restoreOrder(order); toast.dismiss(tst.id); }} className="inline-flex min-h-[44px] items-center px-2 font-semibold text-primary underline">Undo</button>
    </span>
  ), { duration: 6000 });
  function doCancel(o) { setConfirm(null); cancelOrder(o.id); undoToast('Order cancelled.', o); }
  function doDelete(o) { setConfirm(null); removeOrder(o.id); undoToast('Draft deleted.', o); }
  function allArrived(o) { markReceived(o.id); toast('Marked all arrived — book in on Scan to change stock', { icon: '📦' }); }

  function OrderCard({ o, interactive, draft }) {
    const t = orderTotals(o);
    const est = costOf(o);
    const st = statusFor(o);
    const meta = STATUS_LABEL[st] || STATUS_LABEL.ordered;
    return (
      <li className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Building2 className="h-4 w-4 shrink-0 text-gray-400" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">{o.supplierName || 'Supplier'}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
        </div>
        <div className="mb-2 text-xs text-gray-500">
          {t.received}/{t.ordered} units arrived · {est.value > 0 ? `${money(est.value)}${est.estimated ? ' est.' : ''}` : 'no cost recorded'}
        </div>
        <ul className="space-y-1.5">
          {(o.lines || []).map((l) => {
            const remaining = Math.max(0, (Number(l.qty) || 0) - (Number(l.receivedQty) || 0));
            return (
              <li key={l.id} className="flex items-center gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate text-gray-800">{l.name}</span>
                <span className={`tabular-nums ${remaining === 0 ? 'text-success' : 'text-gray-500'}`}>{l.receivedQty || 0}/{l.qty}</span>
                {interactive && (Number(l.receivedQty) || 0) > 0 && (
                  <button type="button" onClick={() => receiveOne(o, l, -1)} className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-500 active:scale-95" aria-label={`Un-mark one ${l.name} arrived`}><Minus className="h-4 w-4" /></button>
                )}
                {interactive && remaining > 0 && (
                  <button type="button" onClick={() => receiveOne(o, l, 1)} className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-primary active:scale-95" aria-label={`Mark one ${l.name} arrived`}><Plus className="h-4 w-4" /></button>
                )}
              </li>
            );
          })}
        </ul>
        {draft && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => { sendOrder(o.id); toast.success('Marked as sent — remember to actually send it to the supplier'); }} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-white active:scale-95"><Send className="h-3.5 w-3.5" /> Mark as sent</button>
            <button type="button" onClick={() => shareOrder(o)} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-gray-100 px-3 text-xs font-semibold text-gray-600 active:scale-95"><Share2 className="h-3.5 w-3.5" /> Share to supplier</button>
            <button type="button" onClick={() => setConfirm({ kind: 'delete', order: o })} className="ml-auto inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-gray-400 hover:text-danger" aria-label={`Delete draft order for ${o.supplierName || 'supplier'}`}><X className="h-3.5 w-3.5" /> Delete</button>
          </div>
        )}
        {interactive && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => shareOrder(o)} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-gray-100 px-3 text-xs font-semibold text-gray-600 active:scale-95"><Share2 className="h-3.5 w-3.5" /> Share</button>
            <button type="button" onClick={() => allArrived(o)} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-success px-3 text-xs font-semibold text-white active:scale-95" aria-label={`Mark all arrived for ${o.supplierName || 'supplier'}`}><Check className="h-3.5 w-3.5" /> Mark all arrived</button>
            <button type="button" onClick={() => setConfirm({ kind: 'cancel', order: o })} className="ml-auto inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-gray-400 hover:text-danger" aria-label={`Cancel order for ${o.supplierName || 'supplier'}`}><X className="h-3.5 w-3.5" /> Cancel</button>
          </div>
        )}
      </li>
    );
  }

  return (
    <div>
      <ScreenBack onBack={onBack} label="Home" />
      <h2 className="mb-1 text-base font-bold text-gray-900">Orders</h2>
      <p className="mb-4 text-xs text-gray-400">Recording an order just tracks it here — it does <strong>not</strong> message the supplier, and ticking lines <strong>doesn’t change stock</strong>. Use “Mark as sent” / “Share” when you’ve placed it, and book deliveries in on the Scan tab.</p>

      {drafts.length === 0 && open.length === 0 && done.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><ShoppingCart className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">No orders yet</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Build a buy list, then tap “Place order” on a supplier group to start tracking it here.</p>
        </div>
      ) : (
        <>
          {drafts.length > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400"><ShoppingCart className="h-3.5 w-3.5" /> Recorded — not sent yet</h3>
              <ul className="space-y-2">{drafts.map((o) => <OrderCard key={o.id} o={o} draft />)}</ul>
            </section>
          )}
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

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === 'delete' ? 'Delete this draft order?' : 'Cancel this order?'}
        message={confirm?.kind === 'delete' ? 'Removes the draft from here. It was never sent.' : 'Marks the order cancelled. Nothing is sent to the supplier.'}
        confirmLabel={confirm?.kind === 'delete' ? 'Delete' : 'Cancel order'}
        cancelLabel="Keep"
        tone="danger"
        onConfirm={() => (confirm?.kind === 'delete' ? doDelete(confirm.order) : doCancel(confirm.order))}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
