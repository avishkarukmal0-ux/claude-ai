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
export function reconcile({ delivery, invoice } = {}) {
  const dLines = (delivery && delivery.lines) || [];
  const iLines = (invoice && invoice.lines) || [];
  const invoiceId = (invoice && invoice.id) || null;
  const invoiceRef = (invoice && invoice.reference) || '';
  const deliveryId = (delivery && delivery.id) || null;
  const dByKey = new Map();
  for (const dl of dLines) { const k = key(dl); if (k && !dByKey.has(k)) dByKey.set(k, dl); }
  const usedDelivery = new Set();
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

    const dl = k ? dByKey.get(k) : null;
    if (!dl) {
      // Billed for something that isn't on the delivery at all.
      discrepancies.push({
        type: 'not_delivered', claimReason: 'missing', name, productId: il.productId || null, barcode: il.barcode || '',
        units: invU, overcharge: r2(invoiceLineTotal(il)), ...refs(il, null),
        detail: `Invoiced ${invU} unit(s) of "${name}" but it isn't on the delivery → claim the full ${money(invoiceLineTotal(il))}.`,
      });
      continue;
    }
    usedDelivery.add(k);
    const delU = deliveredUnits(dl);
    const delCost = deliveryUnitCost(dl);

    // Pack-size mismatch is informational — we always compare in single units, but flag it so the owner
    // knows why the figures differ.
    if (deliveryPack(dl) !== (Number(il.packSize) || 1)) {
      discrepancies.push({
        type: 'pack_mismatch', claimReason: null, name, productId: il.productId || null,
        units: 0, overcharge: 0, ...refs(il, dl),
        detail: `Pack size differs (delivery ${deliveryPack(dl)}/case vs invoice ${Number(il.packSize) || 1}/case). Compared in single units.`,
      });
    }

    // Shortage: billed for more units than delivered → the shortfall units are the claim.
    if (invU - delU > EPS) {
      const short = r2(invU - delU);
      discrepancies.push({
        type: 'shortage', claimReason: 'missing', name, productId: il.productId || null, barcode: il.barcode || '',
        units: short, overcharge: mul(invCost, short), ...refs(il, dl),
        detail: `Invoiced ${invU}, delivered ${delU} → ${short} short × ${money(invCost)}/unit = ${money(mul(invCost, short))}.`,
      });
    } else if (delU - invU > EPS) {
      discrepancies.push({
        type: 'extra_delivered', claimReason: null, name, productId: il.productId || null,
        units: r2(delU - invU), overcharge: 0, ...refs(il, dl),
        detail: `Delivered ${delU} but only invoiced ${invU} — more delivered than billed (no claim).`,
      });
    }

    // Overcharge: invoice unit price above the delivered (agreed) unit price, on the units actually billed+delivered.
    if (delCost > 0 && invCost - delCost > EPS) {
      const units = r2(Math.min(invU, delU));
      if (units > 0) {
        discrepancies.push({
          type: 'overcharge', claimReason: 'wrong_price', name, productId: il.productId || null, barcode: il.barcode || '',
          units, unitBilled: r2(invCost), unitAgreed: r2(delCost), overcharge: mul(invCost - delCost, units), ...refs(il, dl),
          detail: `Invoiced ${money(invCost)}/unit vs ${money(delCost)}/unit agreed → ${money(invCost - delCost)} × ${units} = ${money(mul(invCost - delCost, units))}.`,
        });
      }
    }
  }

  // Delivery lines that never matched an invoice line (delivered, not billed) — info only.
  for (const dl of dLines) {
    const k = key(dl);
    if (k && !usedDelivery.has(k) && deliveredUnits(dl) > 0) {
      discrepancies.push({
        type: 'extra_delivered', claimReason: null, name: dl.name || 'Item', productId: dl.productId || null,
        units: deliveredUnits(dl), overcharge: 0, ...refs(null, dl),
        detail: `Delivered ${deliveredUnits(dl)} of "${dl.name || 'item'}" but it's not on the invoice (no claim).`,
      });
    }
  }

  const claimable = discrepancies.filter((d) => d.claimReason);
  const summary = {
    overcharge: sumMoney(claimable.map((d) => d.overcharge)),
    claimable: claimable.length,
    info: discrepancies.length - claimable.length,
    matched: usedDelivery.size,
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
