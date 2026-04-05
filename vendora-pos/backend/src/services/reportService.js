'use strict';

const Sale = require('../models/Sale');
const Staff = require('../models/Staff');
const Product = require('../models/Product');
const CashDrawer = require('../models/CashDrawer');
const AuditLog = require('../models/AuditLog');
const { todayStart, todayEnd } = require('../utils/helpers');

async function getXReport(storeId, tillId) {
  const start = todayStart();
  const end = todayEnd();
  return _buildShiftReport(storeId, tillId, start, end);
}

async function getZReport(storeId, tillId, staffId) {
  const start = todayStart();
  const end = todayEnd();
  const data = await _buildShiftReport(storeId, tillId, start, end);

  await AuditLog.create({
    store: storeId,
    staff: staffId,
    action: 'z_report_generated',
    entityType: 'CashDrawer',
    occurredAt: new Date(),
  });

  return { ...data, reportType: 'Z', closedAt: new Date() };
}

async function _buildShiftReport(storeId, tillId, start, end) {
  const query = {
    store: storeId,
    status: 'completed',
    isTraining: false,
    completedAt: { $gte: start, $lte: end },
  };

  if (tillId && tillId !== 'ALL') query.tillId = tillId;

  const sales = await Sale.find(query);

  const summary = {
    transactionCount: sales.length,
    grossSales: 0,
    discountTotal: 0,
    netSales: 0,
    vatTotal: 0,
    byPaymentMethod: {},
    byCategory: {},
    topProducts: {},
    voidCount: 0,
    refundCount: 0,
  };

  for (const sale of sales) {
    summary.grossSales += sale.total || 0;
    summary.discountTotal += sale.discountTotal || 0;

    for (const payment of sale.payments || []) {
      if (!summary.byPaymentMethod[payment.method]) {
        summary.byPaymentMethod[payment.method] = { count: 0, amount: 0 };
      }
      summary.byPaymentMethod[payment.method].count++;
      summary.byPaymentMethod[payment.method].amount += payment.amount || 0;
    }

    for (const item of sale.items || []) {
      if (!summary.topProducts[item.barcode]) {
        summary.topProducts[item.barcode] = { name: item.name, qty: 0, revenue: 0 };
      }
      summary.topProducts[item.barcode].qty += item.quantity;
      summary.topProducts[item.barcode].revenue += item.lineTotal || 0;
    }

    for (const vat of sale.vatBreakdown || []) {
      summary.vatTotal += vat.vatAmount || 0;
    }
  }

  // Voids and refunds for the day
  const [voids, refunds] = await Promise.all([
    Sale.countDocuments({ store: storeId, status: 'voided', voidedAt: { $gte: start, $lte: end } }),
    Sale.countDocuments({ store: storeId, status: { $in: ['refunded', 'partially_refunded'] }, completedAt: { $gte: start, $lte: end } }),
  ]);

  summary.voidCount = voids;
  summary.refundCount = refunds;
  summary.netSales = summary.grossSales - summary.discountTotal;

  const topProductsArray = Object.entries(summary.topProducts)
    .map(([barcode, data]) => ({ barcode, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    reportType: 'X',
    tillId,
    period: { start, end },
    ...summary,
    topProducts: topProductsArray,
  };
}

async function getDailySummary(storeId, date) {
  const d = date ? new Date(date) : new Date();
  const start = new Date(d); start.setHours(0, 0, 0, 0);
  const end = new Date(d); end.setHours(23, 59, 59, 999);

  const sales = await Sale.find({
    store: storeId,
    status: 'completed',
    isTraining: false,
    completedAt: { $gte: start, $lte: end },
  });

  let totalRevenue = 0, txCount = 0;
  const byCategory = {};
  const byStaff = {};
  const byPayment = {};
  const byHour = {};

  for (const sale of sales) {
    totalRevenue += sale.total || 0;
    txCount++;

    const staffKey = sale.staffName || sale.staff?.toString() || 'Unknown';
    if (!byStaff[staffKey]) byStaff[staffKey] = { revenue: 0, count: 0 };
    byStaff[staffKey].revenue += sale.total;
    byStaff[staffKey].count++;

    const hour = new Date(sale.completedAt).getHours();
    if (!byHour[hour]) byHour[hour] = { revenue: 0, count: 0 };
    byHour[hour].revenue += sale.total;
    byHour[hour].count++;

    for (const p of sale.payments || []) {
      if (!byPayment[p.method]) byPayment[p.method] = { amount: 0, count: 0 };
      byPayment[p.method].amount += p.amount || 0;
      byPayment[p.method].count++;
    }

    for (const item of sale.items || []) {
      const cat = item.category || 'Unknown';
      if (!byCategory[cat]) byCategory[cat] = { revenue: 0, units: 0 };
      byCategory[cat].revenue += item.lineTotal || 0;
      byCategory[cat].units += item.quantity;
    }
  }

  return {
    date: start,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    transactionCount: txCount,
    averageBasket: txCount > 0 ? Math.round((totalRevenue / txCount) * 100) / 100 : 0,
    byCategory,
    byStaff,
    byPaymentMethod: byPayment,
    byHour,
  };
}

async function getCategoryBreakdown(storeId, from, to) {
  const query = {
    store: storeId,
    status: 'completed',
    isTraining: false,
  };
  if (from) query.completedAt = { $gte: new Date(from) };
  if (to) query.completedAt = { ...(query.completedAt || {}), $lte: new Date(to) };

  const sales = await Sale.find(query);
  const categories = {};

  for (const sale of sales) {
    for (const item of sale.items || []) {
      const cat = item.category || 'Unknown';
      if (!categories[cat]) categories[cat] = { revenue: 0, units: 0, cost: 0 };
      categories[cat].revenue += item.lineTotal || 0;
      categories[cat].units += item.quantity;
      categories[cat].cost += (item.costPrice || 0) * item.quantity;
    }
  }

  return Object.entries(categories).map(([category, data]) => ({
    category,
    ...data,
    margin: data.cost > 0 ? ((data.revenue - data.cost) / data.revenue) * 100 : null,
  })).sort((a, b) => b.revenue - a.revenue);
}

async function getStaffPerformance(storeId, from, to) {
  const query = { store: storeId, isTraining: false };
  if (from) query.completedAt = { $gte: new Date(from) };
  if (to) query.completedAt = { ...(query.completedAt || {}), $lte: new Date(to) };

  const [sales, voids, refunds] = await Promise.all([
    Sale.find({ ...query, status: 'completed' }),
    Sale.find({ store: storeId, status: 'voided', ...(from || to ? { voidedAt: query.completedAt } : {}) }),
    Sale.find({ ...query, status: { $in: ['refunded', 'partially_refunded'] } }),
  ]);

  const byStaff = {};

  for (const sale of sales) {
    const key = sale.staffName || sale.staff?.toString();
    if (!byStaff[key]) byStaff[key] = { staffId: sale.staff, staffName: key, revenue: 0, count: 0, voids: 0, refunds: 0, discounts: 0 };
    byStaff[key].revenue += sale.total || 0;
    byStaff[key].count++;
    byStaff[key].discounts += sale.discountTotal || 0;
  }
  for (const v of voids) {
    const key = v.voidedByName || v.voidedBy?.toString();
    if (key && byStaff[key]) byStaff[key].voids++;
  }

  return Object.values(byStaff).map((s) => ({
    ...s,
    averageBasket: s.count > 0 ? Math.round((s.revenue / s.count) * 100) / 100 : 0,
  })).sort((a, b) => b.revenue - a.revenue);
}

async function getHourlyBreakdown(storeId, date) {
  const summary = await getDailySummary(storeId, date);
  const hours = [];
  for (let h = 0; h < 24; h++) {
    hours.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      ...(summary.byHour[h] || { revenue: 0, count: 0 }),
    });
  }
  return hours;
}

async function getProductPerformance(storeId, from, to, limit = 20) {
  const query = { store: storeId, status: 'completed', isTraining: false };
  if (from) query.completedAt = { $gte: new Date(from) };
  if (to) query.completedAt = { ...(query.completedAt || {}), $lte: new Date(to) };

  const sales = await Sale.find(query);
  const products = {};

  for (const sale of sales) {
    for (const item of sale.items || []) {
      const key = item.barcode || item.product?.toString();
      if (!products[key]) products[key] = { barcode: item.barcode, name: item.name, revenue: 0, units: 0, cost: 0 };
      products[key].revenue += item.lineTotal || 0;
      products[key].units += item.quantity;
      products[key].cost += (item.costPrice || 0) * item.quantity;
    }
  }

  const sorted = Object.values(products).sort((a, b) => b.revenue - a.revenue);
  return { top: sorted.slice(0, limit), bottom: sorted.slice(-limit).reverse() };
}

async function getMarginAnalysis(storeId, from, to) {
  const categories = await getCategoryBreakdown(storeId, from, to);
  const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0);
  const totalCost = categories.reduce((s, c) => s + c.cost, 0);
  return {
    categories,
    overall: {
      revenue: totalRevenue,
      cost: totalCost,
      grossProfit: totalRevenue - totalCost,
      margin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
    },
  };
}

async function getPeriodComparison(storeId, p1Start, p1End, p2Start, p2End) {
  const [p1, p2] = await Promise.all([
    getDailySummary(storeId, p1Start),
    getDailySummary(storeId, p2Start),
  ]);

  // For multi-day periods aggregate manually
  const buildPeriod = async (start, end) => {
    const sales = await Sale.find({
      store: storeId,
      status: 'completed',
      isTraining: false,
      completedAt: { $gte: new Date(start), $lte: new Date(end) },
    });
    const revenue = sales.reduce((s, sale) => s + (sale.total || 0), 0);
    return { revenue, count: sales.length, averageBasket: sales.length > 0 ? revenue / sales.length : 0 };
  };

  const [period1, period2] = await Promise.all([
    buildPeriod(p1Start, p1End),
    buildPeriod(p2Start, p2End),
  ]);

  return { period1, period2, change: { revenue: period1.revenue - period2.revenue, percent: period2.revenue > 0 ? ((period1.revenue - period2.revenue) / period2.revenue) * 100 : null } };
}

module.exports = {
  getXReport, getZReport, getDailySummary, getCategoryBreakdown,
  getStaffPerformance, getHourlyBreakdown, getProductPerformance,
  getMarginAnalysis, getPeriodComparison,
};
