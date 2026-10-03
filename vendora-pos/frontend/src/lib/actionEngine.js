// The "Do this today" engine — Vendora's brain.
//
// Takes everything the shop has logged (inventory, sell-through, takings) and
// derives a short, PRIORITISED list of concrete actions, each with a £ impact and
// a place to go. Pure derivation, no backend. This is what turns a pile of data
// into "here's what actually needs doing right now".
//
// Severity order: critical (legal / money-on-fire) → warn (about to cost you) →
// info (worth doing today). We only ever surface the top few so it stays glanceable.

import { expiryInfo, worstExpiry, isLowStock, isSlowStock } from './inventoryStore';
import { OPEN_CLAIM_STATUSES } from './claimStore';
import { claimOutstanding } from './creditNoteStore';
import { velocity, daysOfCover } from './movementStore';

const qtyOf = (p) => Number(p.qty) || 0;
const costOf = (p) => (qtyOf(p) * (Number(p.cost) || 0));
const retailOf = (p) => (qtyOf(p) * (Number(p.price) || 0));
const sum = (list, fn) => list.reduce((n, p) => n + fn(p), 0);
const money = (n) => `£${(Math.round(n * 100) / 100).toFixed(2)}`;
const firstName = (list) => (list[0]?.name || '').trim();
const andMore = (list) => (list.length > 1 ? ` +${list.length - 1} more` : '');

/**
 * Build the prioritised action list.
 * @returns Array<{ id, severity, kind, title, detail, money?, go, cta }>
 */
export function buildActions({ products = [], records = [], todayEntry = null, taskExceptions = 0, claims = [], deliveries = [], now = new Date() } = {}) {
  const actions = [];
  const inStock = products.filter((p) => qtyOf(p) > 0);

  // 0a) WARN — a delivery check was started (draft with lines) but never booked into stock. Until it's
  //     received, that stock isn't counted and any shortage/overcharge isn't claimed — so surface it.
  const openDrafts = (deliveries || []).filter((d) => d && d.status === 'draft' && Array.isArray(d.lines) && d.lines.length > 0);
  if (openDrafts.length) {
    const draftLabel = (openDrafts[0].supplierName || openDrafts[0].reference || '').trim();
    actions.push({
      id: 'delivery-draft',
      severity: 'warn',
      kind: 'delivery',
      title: openDrafts.length === 1 ? 'Finish receiving a delivery' : `Finish receiving ${openDrafts.length} deliveries`,
      detail: `Started but not booked into stock yet${draftLabel ? ` — ${draftLabel}` : ''}. Check it in so your counts and any claim are right.`,
      go: { screen: 'receive' },
      cta: 'Finish delivery',
    });
  }

  // 0b) WARN — supplier claims past their follow-up date (Phase 2 reminders). Uses the EXISTING follow-up
  //     date + claim outstanding; snoozing just moves the date (in Supplier claims).
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const overdueClaims = claims.filter((c) => OPEN_CLAIM_STATUSES.includes(c.status) && c.followUpDate
    && new Date(c.followUpDate).setHours(0, 0, 0, 0) < today.getTime());
  if (overdueClaims.length) {
    const outstanding = overdueClaims.reduce((s, c) => s + claimOutstanding(c), 0);
    actions.push({
      id: 'claims-overdue',
      severity: 'warn',
      kind: 'claims',
      title: overdueClaims.length === 1 ? 'Chase 1 overdue supplier claim' : `Chase ${overdueClaims.length} overdue supplier claims`,
      detail: 'Past their follow-up date — send a reminder or record the credit.',
      money: outstanding > 0 ? `${money(outstanding)} outstanding` : undefined,
      go: { screen: 'claims' },
      cta: 'Open claims',
    });
  }

  // 0) WARN — team tasks that need attention (overdue / high priority). Exceptions only, not
  //    a stream of every task (that lives in Team tasks).
  if (taskExceptions > 0) {
    actions.push({
      id: 'tasks',
      severity: 'warn',
      kind: 'tasks',
      title: taskExceptions === 1 ? '1 team task needs attention' : `${taskExceptions} team tasks need attention`,
      detail: 'Overdue or high-priority jobs on the shop floor.',
      go: { screen: 'tasks' },
      cta: 'Open tasks',
    });
  }

  // 1) CRITICAL — hard-stop dates passed (use-by / medicine). Illegal to sell.
  const mustPull = inStock.filter((p) => { const e = worstExpiry(p, now); return e && e.mustPull; });
  if (mustPull.length) {
    actions.push({
      id: 'pull',
      severity: 'critical',
      kind: 'pull',
      title: mustPull.length === 1 ? 'Pull 1 item — past use-by' : `Pull ${mustPull.length} items — past use-by`,
      detail: `Illegal to sell. ${firstName(mustPull)}${andMore(mustPull)}.`,
      money: `${money(sum(mustPull, retailOf))} to write off`,
      go: { screen: 'waste' },
      cta: 'Log waste',
    });
  }

  // 2) WARN — expiring soon and still sellable → mark it down before it's binned.
  const expiringSoon = inStock.filter((p) => {
    const e = worstExpiry(p, now);
    return e && !e.mustPull && (e.status === 'soon' || e.status === 'expired') && e.daysLeft <= 3;
  });
  if (expiringSoon.length) {
    actions.push({
      id: 'markdown',
      severity: 'warn',
      kind: 'markdown',
      title: expiringSoon.length === 1 ? 'Mark down 1 short-dated line' : `Mark down ${expiringSoon.length} short-dated lines`,
      detail: `Sell it before you bin it. ${firstName(expiringSoon)}${andMore(expiringSoon)}.`,
      money: `${money(sum(expiringSoon, retailOf))} still recoverable`,
      go: { screen: 'waste' },
      cta: 'Review',
    });
  }

  // 3) WARN — fast movers about to sell out (velocity known, <3 days of cover).
  const fastOut = inStock.filter((p) => {
    const { vpd } = velocity(records, p.id);
    return vpd && daysOfCover(p.qty, vpd) <= 3;
  });
  const fastOutIds = new Set(fastOut.map((p) => p.id));
  if (fastOut.length) {
    actions.push({
      id: 'reorder-fast',
      severity: 'warn',
      kind: 'reorder',
      title: fastOut.length === 1 ? '1 fast seller running out' : `${fastOut.length} fast sellers running out`,
      detail: `Reorder before you lose the sale. ${firstName(fastOut)}${andMore(fastOut)}.`,
      go: { screen: 'reorder' },
      cta: 'Add to buy list',
    });
  }

  // 4) INFO — other low stock not already flagged as a fast mover.
  const low = products.filter((p) => isLowStock(p) && !fastOutIds.has(p.id));
  if (low.length) {
    actions.push({
      id: 'low',
      severity: 'info',
      kind: 'reorder',
      title: low.length === 1 ? '1 line running low' : `${low.length} lines running low`,
      detail: `Build your cash-&-carry list. ${firstName(low)}${andMore(low)}.`,
      go: { screen: 'reorder' },
      cta: 'Build list',
    });
  }

  // 5) INFO — dead money: in stock but not moving for 30+ days.
  const dead = products.filter((p) => isSlowStock(p, 30));
  if (dead.length) {
    actions.push({
      id: 'deadstock',
      severity: 'info',
      kind: 'deadstock',
      title: `${money(sum(dead, costOf))} tied up in slow stock`,
      detail: `${dead.length} line${dead.length === 1 ? '' : 's'} not moving. Discount to free the cash.`,
      go: { screen: 'deadstock' },
      cta: 'See slow stock',
    });
  }

  // 6) INFO — after midday with no takings logged → nudge the cash-up.
  const hour = now.getHours();
  if (!todayEntry && hour >= 12) {
    actions.push({
      id: 'cashup',
      severity: 'info',
      kind: 'cashup',
      title: 'Log today’s takings',
      detail: 'Cash up so your numbers stay right.',
      go: { screen: 'takings' },
      cta: 'Cash up',
    });
  }

  const rank = { critical: 0, warn: 1, info: 2 };
  return actions.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 5);
}
