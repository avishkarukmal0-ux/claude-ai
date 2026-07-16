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

module.exports = router;
