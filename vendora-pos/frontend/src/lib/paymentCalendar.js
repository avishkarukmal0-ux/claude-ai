// Supplier-payment calendar (Phase 5) — a lightweight view of what's due to suppliers, derived from the
// invoices/orders/claims the shop already keeps. Pure + tested.
//
// IMPORTANT (mandate): this is NOT accounting and NOT profit reporting. It shows invoice due dates + payment
// status, upcoming buying commitments (open orders), and EXPECTED CREDITS shown SEPARATELY — never netted
// into "available funds" (an expected credit is not cash). Where information is missing (no total, no due
// date) it is called out, not guessed.
import { invoiceOwed, invoicePaymentStatus } from './invoiceStore';
import { creditOutstanding } from './creditReport';
import { orderTotals, statusFor, OPEN_STATUSES } from './orderStore';
import { round2, sumMoney } from './money';

const arr = (v) => (Array.isArray(v) ? v : []);
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function paymentCalendar({ invoices = [], orders = [], claims = [], now = Date.now() } = {}) {
  // Only committed invoices represent a real bill; a paid one drops off.
  const payable = arr(invoices).filter((i) => i.status === 'committed' && invoicePaymentStatus(i) !== 'paid');

  const dueSoon = payable.map((i) => {
    const owed = invoiceOwed(i);
    const due = i.dueDate ? new Date(i.dueDate).getTime() : null;
    return {
      invoiceId: i.id,
      supplierName: i.supplierName || 'Supplier',
      reference: i.reference || '',
      dueDate: i.dueDate || null,
      owed, // null when no total recorded
      status: invoicePaymentStatus(i),
      overdue: due != null && due < startOfDay(now) && (owed == null || owed > 0),
    };
  }).sort((a, b) => {
    if (!!a.dueDate !== !!b.dueDate) return a.dueDate ? -1 : 1;       // dated first
    if (!a.dueDate) return 0;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(); // soonest first
  });

  const totalOwed = sumMoney(payable.map((i) => invoiceOwed(i) || 0)); // known totals only
  const overdueOwed = sumMoney(dueSoon.filter((d) => d.overdue).map((d) => d.owed || 0));

  const openOrders = arr(orders).filter((o) => OPEN_STATUSES.includes(statusFor(o)));
  const commitments = round2(openOrders.reduce((n, o) => n + (orderTotals(o).cost || 0), 0));

  const expectedCredits = creditOutstanding(claims); // shown SEPARATELY — not available cash

  const warnings = [];
  const noTotal = payable.filter((i) => invoiceOwed(i) == null).length;
  const noDue = payable.filter((i) => !i.dueDate).length;
  if (noTotal) warnings.push(`${noTotal} unpaid invoice${noTotal === 1 ? '' : 's'} with no total recorded — not included in what you owe.`);
  if (noDue) warnings.push(`${noDue} unpaid invoice${noDue === 1 ? '' : 's'} with no due date — add one to schedule it.`);

  return {
    dueSoon,
    totalOwed,
    overdueOwed,
    commitments,
    expectedCredits,
    warnings,
    counts: { payable: payable.length, openOrders: openOrders.length, overdue: dueSoon.filter((d) => d.overdue).length },
  };
}
