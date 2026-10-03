// Delivery ↔ invoice reconciliation (Phase 1.2). Pure + unit-tested. Compares what was DELIVERED against
// what the supplier INVOICED (an order is optional context), normalising pack sizes to single units first,
// and reports explained discrepancies the owner can turn into a claim via the EXISTING claims workflow.
//
// Discrepancy types → claim reason:
//   shortage        — billed for more units than delivered → reason 'missing', amount = short units × invoice £/unit
//   overcharge      — invoice £/unit > delivered (agreed) £/unit → reason 'wrong_price', amount = (billed−agreed) × matched units
//   not_delivered   — an invoice line with no matching delivery line → reason 'missing', amount = full invoice line
//   pack_mismatch   — same product, different pack size on invoice vs delivery → INFO only (we compare in units)
//   extra_delivered — delivered more than invoiced, or a delivery line not on the invoice → INFO only (no claim)
// Shortage (missing units) and overcharge (delivered units) act on DISJOINT unit sets, so they never
// double-count the same units.
//
// Every discrepancy preserves SOURCE REFERENCES — the invoice + delivery document ids and the specific
// line ids — and a human-readable `detail` showing the calculation (acceptance A1/A2). Currency maths uses
// the decimal-safe money helpers (A3).
import { deliveredUnits, perUnitCost as deliveryUnitCost, packSize as deliveryPack } from './deliveryStore';
import { lineUnits as invoiceUnits, lineUnitCost as invoiceUnitCost, lineTotal as invoiceLineTotal } from './invoiceStore';
import { round2 as r2, sumMoney, mul, money } from './money';

const EPS = 0.005;
const key = (l) => (l.productId ? `p:${l.productId}` : (l.barcode ? `b:${String(l.barcode).trim()}` : (l.name ? `n:${String(l.name).trim().toLowerCase()}` : null)));

/**
 * @param {{ delivery:{id?,lines:[]}, invoice:{id?,reference?,lines:[]}, order?:{lines:[]} }} input
 * @returns {{ discrepancies:[], summary:{ overcharge, claimable, info, matched } }}
 */
export function reconcile({ delivery, invoice, order } = {}) {
  const dLines = (delivery && delivery.lines) || [];
  const iLines = (invoice && invoice.lines) || [];
  const invoiceId = (invoice && invoice.id) || null;
  const invoiceRef = (invoice && invoice.reference) || '';
  const deliveryId = (delivery && delivery.id) || null;
  // Audit D3: AGGREGATE delivered supply per product key (not first-line-only), and CONSUME it across invoice
  // lines, so multiple delivery/invoice lines for the same product neither miss real shortages nor reuse the
  // same delivered units. dAgg carries summed units, a units-weighted agreed unit cost, the first line (for
  // refs/pack) and all delivery line ids.
  const dAgg = new Map();
  for (const dl of dLines) {
    const k = key(dl); if (!k) continue;
    const u = deliveredUnits(dl); const c = deliveryUnitCost(dl);
    const a = dAgg.get(k) || { units: 0, costWeighted: 0, first: dl, lineIds: [] };
    a.units += u; a.costWeighted += c * u; if (dl && dl.id) a.lineIds.push(dl.id);
    dAgg.set(k, a);
  }
  const dAggCost = (a) => (a && a.units > 0 ? a.costWeighted / a.units : 0);
  const consumed = new Map(); // key → delivered units already matched to earlier invoice lines
  const discrepancies = [];
  // Common source refs attached to every discrepancy so a claim item can trace back to its documents.
  const refs = (il, dl) => ({
    invoiceId, invoiceRef, deliveryId,
    invoiceLineId: (il && il.id) || null,
    deliveryLineId: (dl && dl.id) || null,
  });

  for (const il of iLines) {
    const k = key(il);
    const name = il.name || (il.barcode ? `#${il.barcode}` : 'Item');
    const invU = invoiceUnits(il);
    const invCost = invoiceUnitCost(il);
    if (invU <= 0) continue;

    const agg = k ? dAgg.get(k) : null;
    const dl = agg ? agg.first : null;
    if (!agg) {
      // Billed for something that isn't on the delivery at all.
      discrepancies.push({
        type: 'not_delivered', claimReason: 'missing', name, productId: il.productId || null, barcode: il.barcode || '',
        units: invU, overcharge: r2(invoiceLineTotal(il)), ...refs(il, null),
        detail: `Invoiced ${invU} unit(s) of "${name}" but it isn't on the delivery → claim the full ${money(invoiceLineTotal(il))}.`,
      });
      continue;
    }
    // D3: delivered units are a shared pool per product — consume what earlier invoice lines already matched so
    // a second invoice line for the same product can't re-bill the same delivered units (would miss a real
    // shortage), and summed delivery lines can't be under-counted (would invent a shortage). matchU = units
    // this line can legitimately draw from the remaining delivered supply.
    const alreadyUsed = consumed.get(k) || 0;
    const available = r2(agg.units - alreadyUsed);
    const matchU = r2(Math.min(invU, Math.max(0, available)));
    consumed.set(k, r2(alreadyUsed + matchU));
    const delCost = dAggCost(agg); // units-weighted agreed £/unit across all delivery lines for this product

    // Pack-size mismatch is informational — we always compare in single units, but flag it so the owner
    // knows why the figures differ.
    if (deliveryPack(dl) !== (Number(il.packSize) || 1)) {
      discrepancies.push({
        type: 'pack_mismatch', claimReason: null, name, productId: il.productId || null,
        units: 0, overcharge: 0, ...refs(il, dl),
        detail: `Pack size differs (delivery ${deliveryPack(dl)}/case vs invoice ${Number(il.packSize) || 1}/case). Compared in single units.`,
      });
    }

    // Shortage: billed for more units than the remaining delivered supply covers → the shortfall is the claim.
    if (invU - matchU > EPS) {
      const short = r2(invU - matchU);
      discrepancies.push({
        type: 'shortage', claimReason: 'missing', name, productId: il.productId || null, barcode: il.barcode || '',
        units: short, overcharge: mul(invCost, short), ...refs(il, dl),
        detail: `Invoiced ${invU}, ${matchU} covered by the delivery → ${short} short × ${money(invCost)}/unit = ${money(mul(invCost, short))}.`,
      });
    }

    // Overcharge: invoice unit price above the delivered (agreed) unit price, on the units actually matched.
    if (delCost > 0 && invCost - delCost > EPS && matchU > 0) {
      discrepancies.push({
        type: 'overcharge', claimReason: 'wrong_price', name, productId: il.productId || null, barcode: il.barcode || '',
        units: matchU, unitBilled: r2(invCost), unitAgreed: r2(delCost), overcharge: mul(invCost - delCost, matchU), ...refs(il, dl),
        detail: `Invoiced ${money(invCost)}/unit vs ${money(delCost)}/unit agreed → ${money(invCost - delCost)} × ${matchU} = ${money(mul(invCost - delCost, matchU))}.`,
      });
    }
  }

  // Delivered units left unconsumed after every invoice line is accounted for (delivered more than billed, or a
  // product delivered but not on the invoice at all) — info only, one line per product.
  for (const [k, agg] of dAgg) {
    const leftover = r2(agg.units - (consumed.get(k) || 0));
    if (leftover > EPS) {
      const dl = agg.first;
      discrepancies.push({
        type: 'extra_delivered', claimReason: null, name: dl.name || 'Item', productId: dl.productId || null,
        units: leftover, overcharge: 0, ...refs(null, dl),
        detail: `Delivered ${agg.units} of "${dl.name || 'item'}" but only ${r2(consumed.get(k) || 0)} invoiced — ${leftover} more delivered than billed (no claim).`,
      });
    }
  }

  // When an ORDER exists, compare it too (mandate: compare ordered quantities and agreed prices with the
  // delivery and invoice). These are INFO-only (no claimReason) so they enrich the picture without
  // double-counting the claimable delivered-vs-invoiced discrepancies above. Order qty is already in single
  // units (orders carry no pack mode), so no extra normalisation is needed to line it up with the unit maths.
  const oLines = (order && order.lines) || [];
  if (oLines.length) {
    const iByKey = new Map();
    for (const il of iLines) { const k = key(il); if (k && !iByKey.has(k)) iByKey.set(k, il); }
    for (const ol of oLines) {
      const k = key(ol);
      const name = ol.name || (ol.barcode ? `#${ol.barcode}` : 'Item');
      const orderedQty = Number(ol.qty) || 0;
      if (orderedQty <= 0) continue;
      const agg = k ? dAgg.get(k) : null;
      const dl = agg ? agg.first : null;
      const il = k ? iByKey.get(k) : null;
      const delU = agg ? r2(agg.units) : 0; // D3: total delivered across all lines for this product
      // Ordered vs delivered (under-delivery against the order).
      if (orderedQty - delU > EPS) {
        discrepancies.push({
          type: 'order_short', claimReason: null, name, productId: ol.productId || null, barcode: ol.barcode || '',
          units: r2(orderedQty - delU), overcharge: 0, ...refs(il, dl),
          detail: `Ordered ${orderedQty}, delivered ${delU} → ${r2(orderedQty - delU)} short against the order.`,
        });
      }
      // Agreed (order) price vs invoiced price — informational heads-up.
      const agreed = ol.unitCost == null || ol.unitCost === '' ? null : Number(ol.unitCost);
      if (il && agreed != null && Number.isFinite(agreed) && agreed > 0) {
        const invCost = invoiceUnitCost(il);
        if (Math.abs(invCost - agreed) > EPS) {
          discrepancies.push({
            type: 'order_price', claimReason: null, name, productId: ol.productId || null,
            units: 0, overcharge: 0, ...refs(il, dl),
            detail: `Ordered at ${money(agreed)}/unit, invoiced ${money(invCost)}/unit — ${invCost > agreed ? 'higher' : 'lower'} than agreed.`,
          });
        }
      }
    }
  }

  const claimable = discrepancies.filter((d) => d.claimReason);
  const summary = {
    overcharge: sumMoney(claimable.map((d) => d.overcharge)),
    claimable: claimable.length,
    info: discrepancies.length - claimable.length,
    matched: [...consumed.values()].filter((u) => u > EPS).length,
  };
  return { discrepancies, summary };
}

/** Turn claimable reconcile discrepancies into claim items (shape matches claimItemsFromDelivery). Carries
 *  the source document + line references and the calculation detail so a claim item is fully traceable. */
export function discrepanciesToClaimItems(discrepancies = []) {
  return discrepancies
    .filter((d) => d.claimReason)
    .map((d) => {
      const base = {
        name: d.name, barcode: d.barcode || '', productId: d.productId || null,
        qty: d.units, reason: d.claimReason, amount: r2(d.overcharge),
        invoiceId: d.invoiceId || null, invoiceRef: d.invoiceRef || '',
        invoiceLineId: d.invoiceLineId || null, deliveryLineId: d.deliveryLineId || null,
        detail: d.detail || '',
      };
      if (d.claimReason === 'wrong_price') { base.unitBilled = d.unitBilled; base.unitAgreed = d.unitAgreed; }
      return base;
    });
}
