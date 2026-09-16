'use strict';

const Sale = require('../models/Sale');
const PurchaseOrder = require('../models/PurchaseOrder');
const Expense = require('../models/Expense');
const VatReturn = require('../models/VatReturn');
const AccountingSettings = require('../models/AccountingSettings');

/**
 * Round to 2dp (pennies)
 */
const r2 = (n) => Math.round((n || 0) * 100) / 100;

/**
 * Calculate a VAT return for a given period from live Sale / PurchaseOrder / Expense data.
 * Returns an unsaved VatReturn document (caller can save or preview).
 */
async function calculateVatReturn(storeId, periodStart, periodEnd) {
  const start = new Date(periodStart);
  const end   = new Date(periodEnd);

  // ── Sales analysis ──────────────────────────────────────────────────────────
  const sales = await Sale.find({
    store: storeId,
    status: 'completed',
    completedAt: { $gte: start, $lte: end },
  }).lean();

  let standardRatedSales = 0; // net (exc VAT)
  let reducedRatedSales  = 0;
  let zeroRatedSales     = 0;
  let exemptSales        = 0;
  let vatOnSales         = 0;   // box1

  for (const sale of sales) {
    if (Array.isArray(sale.vatBreakdown) && sale.vatBreakdown.length) {
      for (const vb of sale.vatBreakdown) {
        const rate = parseFloat(vb.rate) || 0;
        const net  = vb.netAmount || 0;
        const vat  = vb.vatAmount || 0;
        vatOnSales += vat;
        if (rate === 20)      standardRatedSales += net;
        else if (rate === 5)  reducedRatedSales  += net;
        else if (rate === 0)  zeroRatedSales     += net;
        else                  exemptSales        += net;
      }
    } else {
      // Fallback: use item-level vatAmount
      for (const item of (sale.items || [])) {
        const rate = parseFloat(item.vatRate) || 0;
        const vat  = item.vatAmount || 0;
        const net  = (item.lineTotal || 0) - vat;
        vatOnSales += vat;
        if (rate === 20)      standardRatedSales += net;
        else if (rate === 5)  reducedRatedSales  += net;
        else if (rate === 0)  zeroRatedSales     += net;
        else                  exemptSales        += net;
      }
    }
  }

  const totalSalesExcVat = standardRatedSales + reducedRatedSales + zeroRatedSales + exemptSales;

  // ── Purchases VAT reclaimable ─────────────────────────────────────────────
  // From Purchase Orders (received in period)
  const pos = await PurchaseOrder.find({
    store: storeId,
    status: { $in: ['received', 'partial'] },
    'delivery.actualDate': { $gte: start, $lte: end },
  }).lean();

  let vatOnPurchaseOrders = 0;
  let totalPurchasesExcVat = 0;
  for (const po of pos) {
    const vatAmount = po.totals?.vat || 0;
    const subtotal  = po.totals?.subtotal || 0;
    vatOnPurchaseOrders   += vatAmount;
    totalPurchasesExcVat  += subtotal;
  }

  // From Expenses with reclaimable VAT
  const expenses = await Expense.find({
    store: storeId,
    date: { $gte: start, $lte: end },
    vatReclaimable: true,
    vatAmount: { $gt: 0 },
  }).lean();

  let vatOnExpenses = 0;
  for (const exp of expenses) {
    vatOnExpenses        += exp.vatAmount || 0;
    totalPurchasesExcVat += exp.netAmount || 0;
  }

  const vatReclaimable = vatOnPurchaseOrders + vatOnExpenses;

  // ── Build HMRC VAT100 boxes ──────────────────────────────────────────────
  const box1 = r2(vatOnSales);                              // VAT due on sales
  const box2 = 0;                                           // EU acquisitions (not applicable post-Brexit for most)
  const box3 = r2(box1 + box2);                             // total VAT due
  const box4 = r2(vatReclaimable);                          // VAT reclaimable
  const box5 = r2(Math.abs(box3 - box4));                   // net payable/reclaimable
  const box6 = r2(totalSalesExcVat);                        // total value of sales exc VAT
  const box7 = r2(totalPurchasesExcVat);                    // total value of purchases exc VAT
  const box8 = 0;                                           // EU supplies (not applicable)
  const box9 = 0;                                           // EU acquisitions (not applicable)

  // Quarter label
  const quarter = getQuarterLabel(start);

  return new VatReturn({
    store: storeId,
    period: { start, end, quarter },
    status: 'draft',
    box1, box2, box3, box4, box5, box6, box7, box8, box9,
    salesBreakdown: {
      standardRated:     r2(standardRatedSales),
      reducedRated:      r2(reducedRatedSales),
      zeroRated:         r2(zeroRatedSales),
      exempt:            r2(exemptSales),
      totalVatCollected: r2(vatOnSales),
    },
    purchasesBreakdown: {
      vatReclaimable: r2(vatReclaimable),
      nonReclaimable: 0,
    },
  });
}

function getQuarterLabel(date) {
  const d = new Date(date);
  const m = d.getMonth(); // 0-11
  const y = d.getFullYear();
  if (m < 3)  return `Q4 ${y - 1}/${String(y).slice(2)}`;
  if (m < 6)  return `Q1 ${y}/${String(y + 1).slice(2)}`;
  if (m < 9)  return `Q2 ${y}/${String(y + 1).slice(2)}`;
  return `Q3 ${y}/${String(y + 1).slice(2)}`;
}

/**
 * List VAT returns for a store, newest first.
 */
async function listVatReturns(storeId, limit = 20) {
  return VatReturn.find({ store: storeId })
    .sort({ 'period.start': -1 })
    .limit(limit)
    .lean();
}

module.exports = { calculateVatReturn, listVatReturns };
