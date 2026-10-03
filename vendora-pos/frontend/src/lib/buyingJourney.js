// Buying journey — the guided order→credit workflow, derived (never a new store) from the records the
// shop already keeps. The stages are ALREADY threaded by reference:
//   order.id ──< delivery.orderId ;  claim.deliveryId / claim.invoiceId / claim.supplierId ;
//   claim.credits[].creditNoteId ;  creditNote.allocations[].claimId
// so this module just joins them and derives, for each in-flight purchase, the current stage and the one
// next action — reusing the existing screens (HomePage `screen` keys) as `go` targets. Pure + unit-tested.
//
// The six stages (a shop can legitimately skip some — e.g. check a delivery with no order):
//   order → delivery → invoice → resolve (discrepancy) → claim → credit
//
// Nothing here mutates or sends anything. Recording an order and sending it to a supplier are distinct
// (orderStore.statusFor: a draft order has orderedAt == null); this module only reports which.

import { statusFor, orderTotals } from './orderStore';
import { DELIVERY_ISSUES } from './deliveryStore';
import { claimReceived, claimOutstanding } from './creditReport';
import { round2 } from './money';

export const JOURNEY_STAGES = ['order', 'delivery', 'invoice', 'resolve', 'claim', 'credit'];

const arr = (v) => (Array.isArray(v) ? v : []);
const first = (list) => (list.length ? list[0] : null);

/** Claimable issues on a received delivery (missing / damaged / wrong-price). */
export function claimableIssues(delivery) {
  return arr(delivery && delivery.lines).filter((l) => l.issue && DELIVERY_ISSUES[l.issue]?.claimable);
}

/** The claim(s) raised for a given delivery id (used to prevent raising a duplicate). */
export function claimsForDelivery(claims, deliveryId) {
  if (!deliveryId) return [];
  return arr(claims).filter((c) => c.deliveryId === deliveryId);
}

/** The claim(s) linked to a given invoice id. */
export function claimsForInvoice(claims, invoiceId) {
  if (!invoiceId) return [];
  return arr(claims).filter((c) => c.invoiceId === invoiceId);
}

/** True if a claim already exists for this delivery+invoice pairing — the guard against duplicate claims. */
export function hasClaimFor(claims, { deliveryId = null, invoiceId = null } = {}) {
  return arr(claims).some((c) =>
    (deliveryId && c.deliveryId === deliveryId) || (invoiceId && c.invoiceId === invoiceId));
}

function stage(key, status, label, detail) { return { key, status, label, detail: detail || '' }; }

// --- one journey, built around a delivery (its anchor) or an order awaiting delivery ----------------
function buildFromDelivery(delivery, { orders, invoices, claims }) {
  const order = delivery.orderId ? arr(orders).find((o) => o.id === delivery.orderId) : null;
  const dClaims = claimsForDelivery(claims, delivery.id);
  // The invoice link lives on the claim (set at reconcile time); fall back to none.
  const invoiceId = first(dClaims.filter((c) => c.invoiceId).map((c) => c.invoiceId));
  const invoice = invoiceId ? arr(invoices).find((i) => i.id === invoiceId) : null;
  const issues = claimableIssues(delivery);
  const received = delivery.status === 'received';

  const stages = [];

  // ORDER
  if (order) {
    const st = statusFor(order);
    const t = orderTotals(order);
    if (st === 'draft') stages.push(stage('order', 'current', 'Order', 'Recorded, not sent to the supplier yet'));
    else if (st === 'partially_received') stages.push(stage('order', 'done', 'Order', `Part-received (${t.received}/${t.ordered})`));
    else stages.push(stage('order', 'done', 'Order', order.supplierName || ''));
  } else {
    stages.push(stage('order', 'skipped', 'Order', 'No order — checked directly'));
  }

  // DELIVERY
  if (received) stages.push(stage('delivery', 'done', 'Delivery', `Booked in${issues.length ? ` · ${issues.length} issue${issues.length === 1 ? '' : 's'}` : ''}`));
  else stages.push(stage('delivery', 'current', 'Delivery', 'Started — finish booking it in'));

  // INVOICE — advisory. A linked committed invoice is 'done'; otherwise it's 'optional' once received
  // (checking it catches overcharges the receiver didn't flag, but a shop needn't always capture one, so it
  // never blocks completion or becomes the nagging next action — the Buy hub keeps the direct shortcut).
  if (invoice) stages.push(stage('invoice', invoice.status === 'committed' ? 'done' : 'optional', 'Invoice', invoice.reference || 'Draft — commit it'));
  else if (received) stages.push(stage('invoice', 'optional', 'Invoice', 'Optional — check against the delivery'));
  else stages.push(stage('invoice', 'pending', 'Invoice', ''));

  // RESOLVE (discrepancy) — only meaningful once received
  if (!received) stages.push(stage('resolve', 'pending', 'Resolve', ''));
  else if (issues.length === 0) stages.push(stage('resolve', 'skipped', 'Resolve', 'No discrepancies'));
  else if (dClaims.length === 0) stages.push(stage('resolve', 'attention', 'Resolve', `${issues.length} discrepanc${issues.length === 1 ? 'y' : 'ies'} — raise a claim`));
  else stages.push(stage('resolve', 'done', 'Resolve', 'Claim raised'));

  // CLAIM + CREDIT. A not-yet-agreed claim (draft/submitted/acknowledged) still needs chasing; once the
  // supplier has agreed (approved) or the claim is terminal, the claim's job is done and the CREDIT stage
  // tracks the money. So the next action is "chase the claim" until agreed, then "record the credit".
  const needsChase = dClaims.filter((c) => ['draft', 'submitted', 'acknowledged'].includes(c.status));
  const outstanding = round2(dClaims.reduce((n, c) => n + claimOutstanding(c), 0));
  const receivedAmt = round2(dClaims.reduce((n, c) => n + claimReceived(c), 0));
  if (dClaims.length === 0) {
    stages.push(stage('claim', 'skipped', 'Claim', ''));
    stages.push(stage('credit', 'skipped', 'Credit', ''));
  } else {
    stages.push(stage('claim', needsChase.length ? 'current' : 'done', 'Claim',
      needsChase.length ? `${needsChase.length} to chase` : 'Agreed with supplier'));
    if (outstanding > 0) stages.push(stage('credit', 'current', 'Credit', `£${outstanding.toFixed(2)} still to receive`));
    else if (receivedAmt > 0) stages.push(stage('credit', 'done', 'Credit', `£${receivedAmt.toFixed(2)} received`));
    else stages.push(stage('credit', 'done', 'Credit', 'Nothing owed'));
  }

  return finishJourney({
    id: `dl:${delivery.id}`,
    anchor: 'delivery',
    supplierId: delivery.supplierId || order?.supplierId || null,
    supplierName: delivery.supplierName || order?.supplierName || '',
    refs: {
      orderId: order?.id || null, orderRef: order ? (order.supplierName || '') : '',
      deliveryId: delivery.id, deliveryRef: delivery.reference || '',
      invoiceId: invoice?.id || null, invoiceRef: invoice?.reference || '',
    },
    updatedAt: delivery.updatedAt || delivery.receivedAt || delivery.createdAt || 0,
    stages,
  });
}

// An open order with no delivery yet → a journey awaiting its delivery.
function buildFromOpenOrder(order) {
  const st = statusFor(order);
  const t = orderTotals(order);
  const stages = [
    st === 'draft'
      ? stage('order', 'current', 'Order', 'Recorded, not sent to the supplier yet')
      : stage('order', 'done', 'Order', order.supplierName || ''),
    stage('delivery', 'current', 'Delivery', st === 'partially_received' ? `Part-received (${t.received}/${t.ordered}) — book the rest` : 'Waiting on the delivery'),
    stage('invoice', 'pending', 'Invoice', ''),
    stage('resolve', 'pending', 'Resolve', ''),
    stage('claim', 'skipped', 'Claim', ''),
    stage('credit', 'skipped', 'Credit', ''),
  ];
  return finishJourney({
    id: `o:${order.id}`,
    anchor: 'order',
    supplierId: order.supplierId || null,
    supplierName: order.supplierName || '',
    refs: { orderId: order.id, orderRef: order.supplierName || '', deliveryId: null, deliveryRef: '', invoiceId: null, invoiceRef: '' },
    updatedAt: order.updatedAt || order.orderedAt || order.createdAt || 0,
    stages,
  });
}

// Map the current stage to the single next action (reusing existing screen keys). Never auto-sends.
const NEXT_ACTION = {
  order: { cta: 'Send to supplier', go: { screen: 'orders' }, title: 'Send the order (when you place it)' },
  delivery: { cta: 'Receive delivery', go: { screen: 'receive' }, title: 'Receive the delivery' },
  invoice: { cta: 'Check invoice', go: { screen: 'invoices' }, title: 'Check the invoice against the delivery' },
  resolve: { cta: 'Raise claim', go: { screen: 'claims' }, title: 'Resolve the discrepancy' },
  claim: { cta: 'Follow up claim', go: { screen: 'claims' }, title: 'Follow up the claim' },
  credit: { cta: 'Record credit', go: { screen: 'credit-notes' }, title: 'Record the credit received' },
};

function finishJourney(j) {
  // Only 'attention' (a discrepancy to resolve) and 'current' (the active step) drive the next action.
  // 'pending' (a future step not yet reachable) and 'optional'/'skipped'/'done' never nag.
  const actionable = j.stages.find((s) => s.status === 'attention')
    || j.stages.find((s) => s.status === 'current');
  const currentStage = actionable ? actionable.key : null;
  const complete = !actionable;
  const na = currentStage ? NEXT_ACTION[currentStage] : null;
  return {
    ...j,
    currentStage,
    complete,
    attention: j.stages.some((s) => s.status === 'attention'),
    nextAction: na ? { ...na, detail: actionable.detail } : null,
  };
}

/**
 * Build the list of buying journeys, most-recent first. Active (incomplete) ones first.
 * @returns Journey[]
 */
export function buildJourneys({ orders = [], deliveries = [], invoices = [], claims = [], now = Date.now() } = {}) {
  const journeys = [];
  // A delivery anchors a journey.
  for (const d of arr(deliveries)) {
    if (!d || !d.id) continue;
    journeys.push(buildFromDelivery(d, { orders, invoices, claims }));
  }
  // Open orders that have no delivery referencing them yet → awaiting delivery.
  const deliveredOrderIds = new Set(arr(deliveries).map((d) => d.orderId).filter(Boolean));
  for (const o of arr(orders)) {
    if (!o || !o.id) continue;
    const st = statusFor(o);
    if (st === 'cancelled' || st === 'received') continue;         // closed orders aren't in-flight
    // Audit D8: a part-received order still has units outstanding, so keep its own in-flight journey even
    // though a delivery already references it — otherwise the remainder is silently hidden and never chased.
    // Fully-handled orders with a delivery are represented by that delivery's journey.
    if (deliveredOrderIds.has(o.id) && st !== 'partially_received') continue;
    journeys.push(buildFromOpenOrder(o));
  }
  // Sort: incomplete (active) first, then by most-recent activity.
  return journeys.sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? 1 : -1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

/** Just the in-flight journeys (something still to do). */
export function activeJourneys(input) { return buildJourneys(input).filter((j) => !j.complete); }
