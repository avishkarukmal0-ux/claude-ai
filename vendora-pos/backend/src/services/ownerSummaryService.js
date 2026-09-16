'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// OWNER DAILY SUMMARY
// Builds the friendly, plain-English "shop closed fine" recap for a store on a
// given day — the same object the Owner Home modal shows and the nightly
// WhatsApp job sends. Kept in one place so the wording never drifts between the
// screen and the message.
// ─────────────────────────────────────────────────────────────────────────────

const dayjs = require('dayjs');
const mongoose = require('mongoose');

const ShrinkageLog = require('../models/ShrinkageLog');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const reportService = require('./reportService');

const r2 = (n) => Math.round((n || 0) * 100) / 100;
const daysLeft = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);

async function buildOwnerSummary(storeId, date) {
  const storeOid = new mongoose.Types.ObjectId(storeId);
  const now      = new Date();
  const dayStart = dayjs(date || now).startOf('day').toDate();
  const isToday  = dayjs(dayStart).isSame(dayjs(now), 'day');
  const dayEnd   = isToday ? now : dayjs(dayStart).endOf('day').toDate();

  const [salesAgg, margin, shrinkToday, products] = await Promise.all([
    Sale.aggregate([
      { $match: { store: storeOid, status: 'completed', completedAt: { $gte: dayStart, $lte: dayEnd } } },
      { $group: { _id: null, takings: { $sum: '$total' }, count: { $sum: 1 } } },
    ]),
    reportService.getMarginAnalysis(storeId, dayStart, dayEnd),
    ShrinkageLog.find({ store: storeId, occurredAt: { $gte: dayStart, $lte: dayEnd } }).select('totalValue').lean(),
    Product.find({ store: storeId, isActive: true })
      .select('stock.quantity stock.lowStockThreshold pricing.retailPrice expiryBatches').lean(),
  ]);

  const takings      = r2(salesAgg[0]?.takings || 0);
  const transactions = salesAgg[0]?.count || 0;
  const grossProfit  = r2(margin?.overall?.grossProfit || 0);
  const marginPct    = r2(margin?.overall?.margin || 0);
  const theftToday   = r2(shrinkToday.reduce((s, x) => s + (x.totalValue || 0), 0));

  let lowStockCount = 0, expiredCount = 0, expiredValue = 0;
  for (const p of products) {
    const qty = p.stock?.quantity ?? 0;
    const thr = p.stock?.lowStockThreshold ?? 5;
    if (qty <= thr) lowStockCount += 1;
    const price = p.pricing?.retailPrice || 0;
    for (const b of (p.expiryBatches || [])) {
      if (!b || b.quantity <= 0) continue;
      if (daysLeft(b.expiryDate) < 0) { expiredCount += 1; expiredValue += price * b.quantity; }
    }
  }

  const issues = [];
  if (theftToday > 0)    issues.push(`£${theftToday.toFixed(2)} logged as theft/shrinkage`);
  if (expiredCount > 0)  issues.push(`${expiredCount} expired ${expiredCount === 1 ? 'line' : 'lines'} on the shelf`);
  if (lowStockCount > 0) issues.push(`${lowStockCount} ${lowStockCount === 1 ? 'item' : 'items'} low on stock`);

  const allGood   = issues.length === 0;
  const dateLabel = dayjs(dayStart).format('ddd D MMM');
  const headline  = allGood ? 'Shop closed fine 👍' : `${issues.length} thing${issues.length === 1 ? '' : 's'} to check`;

  // Plain-text recap for WhatsApp/SMS or the share sheet.
  const lines = [
    `🏪 ${dateLabel} — ${allGood ? 'all good' : 'quick check'}`,
    `Takings: £${takings.toFixed(2)} (${transactions} sale${transactions === 1 ? '' : 's'})`,
  ];
  if (grossProfit) lines.push(`Profit: £${grossProfit.toFixed(2)} (${marginPct.toFixed(0)}% margin)`);
  if (issues.length) { lines.push('', 'Worth a look:'); issues.forEach(i => lines.push(`• ${i}`)); }
  else lines.push('Nothing needs you. Rest easy.');

  return {
    date: dayStart, dateLabel, isToday,
    allGood, headline,
    takings, transactions, grossProfit, marginPct,
    theftToday, lowStockCount, expiredCount, expiredValue: r2(expiredValue),
    issues,
    shareText: lines.join('\n'),
  };
}

module.exports = { buildOwnerSummary };
