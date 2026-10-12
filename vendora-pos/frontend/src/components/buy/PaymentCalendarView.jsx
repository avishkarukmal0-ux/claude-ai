import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, CalendarClock, AlertTriangle, Wallet, Truck, PiggyBank, Info } from 'lucide-react';
import ScreenBack from '../common/ScreenBack';
import { useInvoices } from '../../lib/invoiceStore';
import { useOrders } from '../../lib/orderStore';
import { useClaims } from '../../lib/claimStore';
import { paymentCalendar } from '../../lib/paymentCalendar';

const money = (v) => { const n = Number(v) || 0; return n < 0 ? `-£${Math.abs(n).toFixed(2)}` : `£${n.toFixed(2)}`; };
const STATUS = {
  unpaid: { label: 'Unpaid', cls: 'bg-gray-100 text-gray-500' },
  partial: { label: 'Part-paid', cls: 'bg-warning-light text-warning-dark' },
  unknown: { label: 'No total', cls: 'bg-gray-100 text-gray-400' },
};

// Supplier-payment calendar (Phase 5). A reminder of what's due — NOT accounting, NOT profit. Expected
// credits are shown separately and never counted as available cash.
export default function PaymentCalendarView({ onBack }) {
  const { invoices, setDueDate, addPayment } = useInvoices();
  const { orders } = useOrders();
  const { claims } = useClaims();
  // Inline payment entry (not window.prompt — that's blocked/ignored in an installed PWA, so the old flow did
  // nothing). Opening a row reveals an amount field; saving records the payment and the calendar recomputes.
  const [pay, setPay] = useState({ id: null, amount: '' });

  const cal = useMemo(() => paymentCalendar({ invoices, orders, claims, now: Date.now() }), [invoices, orders, claims]);

  function submitPayment(inv) {
    const res = addPayment(inv.invoiceId, pay.amount);
    if (res && res.ok === false) { toast.error(res.error || 'Enter a payment amount.'); return; }
    toast.success('Payment recorded');
    setPay({ id: null, amount: '' });
  }

  return (
    <div>
      <ScreenBack onBack={onBack} label="Home" />
      <h2 className="mb-1 text-base font-bold text-gray-900">Payments due</h2>
      <p className="mb-4 text-xs text-gray-400">A reminder of supplier bills and what you’ve committed to buy. Not accounting or profit — just dates and amounts from your records.</p>

      {/* Headline — owed vs commitments, with expected credits kept SEPARATE */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><Wallet className="h-4 w-4" /> You owe</span>
          <span className="mt-1 block text-2xl font-extrabold tabular-nums text-gray-900">{money(cal.totalOwed)}</span>
          {cal.overdueOwed > 0 && <span className="text-xs font-semibold text-danger">{money(cal.overdueOwed)} overdue</span>}
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <span className="flex items-center gap-1.5 text-xs font-medium text-gray-400"><Truck className="h-4 w-4" /> On order</span>
          <span className="mt-1 block text-2xl font-extrabold tabular-nums text-gray-900">{money(cal.commitments)}</span>
          <span className="text-xs text-gray-400">{cal.counts.openOrders} open order{cal.counts.openOrders === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div className="mb-4 rounded-2xl border border-dashed border-success/40 bg-success-light/40 p-3">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-success-dark"><PiggyBank className="h-4 w-4" /> Expected credits: {money(cal.expectedCredits)}</span>
        <p className="mt-0.5 text-xs text-success-dark/80">Owed to you by suppliers (open claims). Shown separately — it isn’t cash in hand and isn’t subtracted from what you owe.</p>
      </div>

      {cal.warnings.length > 0 && (
        <div className="mb-4 space-y-1">
          {cal.warnings.map((w) => (
            <p key={w} className="flex items-start gap-1.5 rounded-xl bg-warning-light/60 p-2 text-xs text-warning-dark"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}</p>
          ))}
        </div>
      )}

      {cal.dueSoon.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><CalendarClock className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">Nothing outstanding</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Committed supplier invoices that aren’t fully paid will appear here with their due dates.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {cal.dueSoon.map((d) => {
            const meta = STATUS[d.status] || STATUS.unpaid;
            return (
              <li key={d.invoiceId} className={`rounded-2xl border p-3 shadow-sm ${d.overdue ? 'border-danger/40 bg-danger-light' : 'border-gray-100 bg-white'}`}>
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900">{d.supplierName}{d.reference ? ` · ${d.reference}` : ''}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
                      {d.dueDate ? <span className={d.overdue ? 'font-semibold text-danger' : ''}>due {new Date(d.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{d.overdue ? ' · overdue' : ''}</span> : <span className="text-gray-400">no due date</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold tabular-nums text-gray-900">{d.owed == null ? '—' : money(d.owed)}</span>
                    <span className="block text-xs text-gray-400">owed</span>
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500">Due
                    <input type="date" value={d.dueDate ? new Date(d.dueDate).toISOString().slice(0, 10) : ''} onChange={(e) => setDueDate(d.invoiceId, e.target.value || null)} className="border-none p-0 text-xs text-gray-900 focus:outline-none" />
                  </label>
                  {pay.id === d.invoiceId ? (
                    <span className="inline-flex items-center gap-1">
                      <input type="number" inputMode="decimal" min="0" step="0.01" autoFocus value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value }))} placeholder="£ amount" aria-label={`Payment amount for ${d.supplierName}`} className="min-h-[44px] w-24 rounded-lg border border-gray-200 px-2 text-sm text-gray-900 focus:border-primary focus:outline-none" />
                      <button type="button" onClick={() => submitPayment(d)} className="inline-flex min-h-[44px] items-center rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white active:scale-95">Save</button>
                      <button type="button" onClick={() => setPay({ id: null, amount: '' })} className="inline-flex min-h-[44px] items-center rounded-lg px-2 text-xs font-semibold text-gray-500">Cancel</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setPay({ id: d.invoiceId, amount: '' })} className="inline-flex min-h-[44px] items-center rounded-lg bg-gray-900 px-3 text-xs font-semibold text-white active:scale-95">Record payment</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 flex items-start gap-1 text-xs text-gray-400"><Info className="mt-0.5 h-3 w-3 shrink-0" /> Figures come only from invoices you’ve committed and payments you record here. This is a cash-flow reminder, not your books.</p>
    </div>
  );
}
