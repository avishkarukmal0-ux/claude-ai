'use strict';

const Sale = require('../models/Sale');
const Refund = require('../models/Refund');
const PurchaseOrder = require('../models/PurchaseOrder');
const Expense = require('../models/Expense');
const PayrollRun = require('../models/PayrollRun');

const r2 = (n) => Math.round((n || 0) * 100) / 100;

/**
 * Generate a Profit & Loss statement for the given period.
 * @param {string|ObjectId} storeId
 * @param {Date|string} periodStart
 * @param {Date|string} periodEnd
 * @returns {object} full P&L structure
 */
async function generatePL(storeId, periodStart, periodEnd) {
  const start = new Date(periodStart);
  const end   = new Date(periodEnd);

  // ── INCOME ────────────────────────────────────────────────────────────────
  const sales = await Sale.find({
    store: storeId,
    status: 'completed',
    completedAt: { $gte: start, $lte: end },
  }).lean();

  let grossRevenue = 0;
  let vatOnSales   = 0;
  let discountTotal = 0;
  let costOfGoods  = 0;

  for (const sale of sales) {
    grossRevenue  += sale.total || 0;
    discountTotal += sale.discountTotal || 0;
    // COGS from cost prices
    for (const item of (sale.items || [])) {
      costOfGoods += (item.costPrice || 0) * (item.quantity || 0);
    }
    // VAT collected
    for (const vb of (sale.vatBreakdown || [])) {
      vatOnSales += vb.vatAmount || 0;
    }
  }

  // Refunds in period
  const refunds = await Refund.find({
    store: storeId,
    createdAt: { $gte: start, $lte: end },
  }).lean();
  let refundTotal = 0;
  for (const ref of refunds) {
    refundTotal += ref.amount || ref.refundAmount || 0;
  }

  const netRevenue       = r2(grossRevenue - refundTotal - vatOnSales);
  const grossProfit      = r2(netRevenue - costOfGoods);
  const grossMarginPct   = netRevenue > 0 ? r2((grossProfit / netRevenue) * 100) : 0;

  // ── OPERATING EXPENSES ───────────────────────────────────────────────────
  const expenses = await Expense.find({
    store: storeId,
    date: { $gte: start, $lte: end },
  }).lean();

  // Group by category
  const expenseByCategory = {};
  let totalExpenses = 0;
  for (const exp of expenses) {
    const cat = exp.category || 'other';
    expenseByCategory[cat] = r2((expenseByCategory[cat] || 0) + (exp.netAmount || 0));
    totalExpenses += exp.netAmount || 0;
  }

  // Payroll from approved/paid payroll runs
  const payrollRuns = await PayrollRun.find({
    store: storeId,
    status: { $in: ['approved', 'paid', 'submitted_rti'] },
    'period.start': { $gte: start },
    'period.end':   { $lte: end },
  }).lean();

  let payrollTotal = 0;
  for (const run of payrollRuns) {
    payrollTotal += run.totals?.employerCost || 0;
  }
  if (payrollTotal > 0) {
    expenseByCategory['staff_wages'] = r2((expenseByCategory['staff_wages'] || 0) + payrollTotal);
    totalExpenses += payrollTotal;
  }

  totalExpenses = r2(totalExpenses);

  // ── PURCHASE ORDERS (COGS supplement) ────────────────────────────────────
  // Already captured via item.costPrice above; PO data provides alternative view
  const receivedPOs = await PurchaseOrder.find({
    store: storeId,
    status: { $in: ['received', 'partial'] },
    'delivery.actualDate': { $gte: start, $lte: end },
  }).lean();

  let purchasesTotal = 0;
  for (const po of receivedPOs) {
    purchasesTotal += (po.totals?.subtotal || 0);
  }

  // ── EBITDA / NET PROFIT ───────────────────────────────────────────────────
  const operatingProfit = r2(grossProfit - totalExpenses);
  const netProfit       = operatingProfit; // tax calculation outside scope for now
  const netMarginPct    = netRevenue > 0 ? r2((netProfit / netRevenue) * 100) : 0;

  return {
    period: { start, end },
    income: {
      grossRevenue:    r2(grossRevenue),
      refunds:         r2(refundTotal),
      vatOnSales:      r2(vatOnSales),
      netRevenue,
      discountsGiven:  r2(discountTotal),
      transactionCount: sales.length,
    },
    costOfGoodsSold: {
      total:   r2(costOfGoods),
      fromPOs: r2(purchasesTotal),
    },
    grossProfit,
    grossMarginPct,
    operatingExpenses: {
      byCategory:   expenseByCategory,
      payroll:      r2(payrollTotal),
      total:        totalExpenses,
    },
    operatingProfit,
    netProfit,
    netMarginPct,
  };
}

module.exports = { generatePL };
