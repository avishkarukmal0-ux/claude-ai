'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// OWNER "THIS WEEK" OVERVIEW
// One screen that leads with the two numbers a UK convenience-store owner feels
// most: £ lost to theft/shrinkage, and £ of stock at risk to waste — plus sales
// and margin. Reinforces Vendora's positioning as the back-office OS for the
// corner shop (see obsidian-vault/Strategy/Positioning.md).
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router  = express.Router();
const dayjs   = require('dayjs');
const mongoose = require('mongoose');
const { requireRole } = require('../middleware/permissions');

const ShrinkageLog = require('../models/ShrinkageLog');
const Incident     = require('../models/Incident');
const ScanPattern  = require('../models/ScanPattern');
const Product      = require('../models/Product');
const Sale         = require('../models/Sale');
const Staff        = require('../models/Staff');
const reportService = require('../services/reportService');

const r2 = (n) => Math.round((n || 0) * 100) / 100;
const daysLeft = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);

// Waste horizon: surface stock 3 weeks out so there's time to sell/mark down
// before it expires. 7 days = the urgent subset that needs action now.
const WASTE_WINDOW_DAYS = 21;
const WASTE_URGENT_DAYS = 7;

router.get('/this-week', requireRole('supervisor'), async (req, res, next) => {
  try {
    const storeId = req.storeId;
    const storeOid = new mongoose.Types.ObjectId(storeId);
    const end       = new Date();
    const start     = dayjs(end).subtract(7, 'day').toDate();
    const prevStart = dayjs(end).subtract(14, 'day').toDate();
    const prevEnd   = start;

    // "Today so far" vs the same slice of the day one week ago — a fair
    // like-for-like ("at this time last week you'd taken £X") so a slow
    // morning doesn't look like a disaster.
    const todayStart         = dayjs(end).startOf('day').toDate();
    const lastWeekDayStart   = dayjs(todayStart).subtract(7, 'day').toDate();
    const lastWeekSameMoment = dayjs(end).subtract(7, 'day').toDate();

    const [
      shrinkThis, shrinkPrev,
      openIncidents, pendingPatterns,
      expiryProducts,
      margin, marginPrev,
      txnCount,
      todayAgg, lastWeekAgg, staffOnShift,
    ] = await Promise.all([
      ShrinkageLog.find({ store: storeId, occurredAt: { $gte: start } }).select('totalValue').lean(),
      ShrinkageLog.find({ store: storeId, occurredAt: { $gte: prevStart, $lt: prevEnd } }).select('totalValue').lean(),
      Incident.countDocuments({ store: storeId, status: { $in: ['open', 'investigating'] } }),
      ScanPattern.countDocuments({ store: storeId, status: 'pending' }),
      Product.find({ store: storeId, isActive: true, 'expiryBatches.0': { $exists: true } })
        .select('pricing.retailPrice expiryBatches').lean(),
      reportService.getMarginAnalysis(storeId, start, end),
      reportService.getMarginAnalysis(storeId, prevStart, prevEnd),
      Sale.countDocuments({ store: storeId, status: 'completed', completedAt: { $gte: start, $lte: end } }),
      Sale.aggregate([
        { $match: { store: storeOid, status: 'completed', completedAt: { $gte: todayStart, $lte: end } } },
        { $group: { _id: null, takings: { $sum: '$total' }, count: { $sum: 1 } } },
      ]),
      Sale.aggregate([
        { $match: { store: storeOid, status: 'completed', completedAt: { $gte: lastWeekDayStart, $lte: lastWeekSameMoment } } },
        { $group: { _id: null, takings: { $sum: '$total' } } },
      ]),
      Staff.countDocuments({ store: storeId, status: 'active', 'timeClock.isOnClock': true }),
    ]);

    // ── Theft / shrinkage ──
    const theftLost     = r2(shrinkThis.reduce((s, x) => s + (x.totalValue || 0), 0));
    const theftLostPrev = r2(shrinkPrev.reduce((s, x) => s + (x.totalValue || 0), 0));

    // ── Waste (expiry) ──
    let wasteExpired = 0;   // value already lost (expired, still on shelf)
    let atRiskSoon   = 0;   // value expiring within 3 weeks (time to sell/mark down)
    let atRiskUrgent = 0;   // subset expiring within 7 days (act now)
    let expiringSoonCount = 0;
    let urgentCount = 0;
    let expiredCount = 0;
    for (const p of expiryProducts) {
      const price = p.pricing?.retailPrice || 0;
      for (const b of (p.expiryBatches || [])) {
        if (!b || b.quantity <= 0) continue;
        const d = daysLeft(b.expiryDate);
        const val = price * b.quantity;
        if (d < 0) { wasteExpired += val; expiredCount += 1; }
        else if (d <= WASTE_WINDOW_DAYS) {
          atRiskSoon += val; expiringSoonCount += 1;
          if (d <= WASTE_URGENT_DAYS) { atRiskUrgent += val; urgentCount += 1; }
        }
      }
    }

    // ── Sales & margin ──
    const revenue     = r2(margin?.overall?.revenue || 0);
    const revenuePrev = r2(marginPrev?.overall?.revenue || 0);
    const grossProfit = r2(margin?.overall?.grossProfit || 0);
    const marginPct   = r2(margin?.overall?.margin || 0);

    const pctChange = (cur, prev) => (prev > 0 ? r2(((cur - prev) / prev) * 100) : null);

    // ── Today so far ──
    const todayTakings    = r2(todayAgg[0]?.takings || 0);
    const todayTxns       = todayAgg[0]?.count || 0;
    const lastWeekTakings = r2(lastWeekAgg[0]?.takings || 0);

    res.json({
      success: true,
      period: { start, end, label: 'Last 7 days' },
      today: {
        takings: todayTakings,
        transactions: todayTxns,
        prevTakings: lastWeekTakings,          // same slice of the day, 1 week ago
        changePct: pctChange(todayTakings, lastWeekTakings),
        staffOnShift,
        asOf: end,
      },
      theft: {
        lost: theftLost,
        prev: theftLostPrev,
        changePct: pctChange(theftLost, theftLostPrev),
        incidents: shrinkThis.length,
        openCases: openIncidents,
        // "crime tax": theft cost spread across the week's transactions
        perTransaction: txnCount > 0 ? r2(theftLost / txnCount) : 0,
      },
      waste: {
        windowDays: WASTE_WINDOW_DAYS,
        urgentDays: WASTE_URGENT_DAYS,
        expired: r2(wasteExpired),
        atRiskSoon: r2(atRiskSoon),      // within 3 weeks
        atRiskUrgent: r2(atRiskUrgent),  // within 7 days (subset)
        expiredCount,
        expiringSoonCount,
        urgentCount,
      },
      sales: {
        revenue,
        prev: revenuePrev,
        changePct: pctChange(revenue, revenuePrev),
        grossProfit,
        marginPct,
        transactions: txnCount,
      },
      alerts: {
        openIncidents,
        pendingPatterns,
        expired: expiredCount,
        expiringSoon: expiringSoonCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// END-OF-DAY "SHOP CLOSED FINE" SUMMARY
// A short, plain-English recap of the day so an owner can glance (or share to
// their own phone) and know the shop is fine — the peace-of-mind payload for
// when they're not behind the till. Defaults to today; ?date=YYYY-MM-DD for a
// past day.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/daily-summary', requireRole('supervisor'), async (req, res, next) => {
  try {
    const storeId  = req.storeId;
    const storeOid = new mongoose.Types.ObjectId(storeId);
    const now      = new Date();
    const dayStart = dayjs(req.query.date || now).startOf('day').toDate();
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

    // Plain-text recap the owner can one-tap share to their own WhatsApp/SMS.
    const lines = [
      `🏪 ${dateLabel} — ${allGood ? 'all good' : 'quick check'}`,
      `Takings: £${takings.toFixed(2)} (${transactions} sale${transactions === 1 ? '' : 's'})`,
    ];
    if (grossProfit) lines.push(`Profit: £${grossProfit.toFixed(2)} (${marginPct.toFixed(0)}% margin)`);
    if (issues.length) { lines.push('', 'Worth a look:'); issues.forEach(i => lines.push(`• ${i}`)); }
    else lines.push('Nothing needs you. Rest easy.');

    res.json({
      success: true,
      date: dayStart, dateLabel, isToday,
      allGood, headline,
      takings, transactions, grossProfit, marginPct,
      theftToday, lowStockCount, expiredCount, expiredValue: r2(expiredValue),
      issues,
      shareText: lines.join('\n'),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
