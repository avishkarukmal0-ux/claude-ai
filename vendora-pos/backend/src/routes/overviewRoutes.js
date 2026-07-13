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
const { requireRole } = require('../middleware/permissions');

const ShrinkageLog = require('../models/ShrinkageLog');
const Incident     = require('../models/Incident');
const ScanPattern  = require('../models/ScanPattern');
const Product      = require('../models/Product');
const Sale         = require('../models/Sale');
const reportService = require('../services/reportService');

const r2 = (n) => Math.round((n || 0) * 100) / 100;
const daysLeft = (d) => Math.ceil((new Date(d) - new Date()) / 86400000);

router.get('/this-week', requireRole('supervisor'), async (req, res, next) => {
  try {
    const storeId = req.storeId;
    const end       = new Date();
    const start     = dayjs(end).subtract(7, 'day').toDate();
    const prevStart = dayjs(end).subtract(14, 'day').toDate();
    const prevEnd   = start;

    const [
      shrinkThis, shrinkPrev,
      openIncidents, pendingPatterns,
      expiryProducts,
      margin, marginPrev,
      txnCount,
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
    ]);

    // ── Theft / shrinkage ──
    const theftLost     = r2(shrinkThis.reduce((s, x) => s + (x.totalValue || 0), 0));
    const theftLostPrev = r2(shrinkPrev.reduce((s, x) => s + (x.totalValue || 0), 0));

    // ── Waste (expiry) ──
    let wasteExpired = 0;   // value already lost (expired, still on shelf)
    let atRiskSoon   = 0;   // value expiring within 7 days (recoverable via markdown)
    let expiringSoonCount = 0;
    let expiredCount = 0;
    for (const p of expiryProducts) {
      const price = p.pricing?.retailPrice || 0;
      for (const b of (p.expiryBatches || [])) {
        if (!b || b.quantity <= 0) continue;
        const d = daysLeft(b.expiryDate);
        const val = price * b.quantity;
        if (d < 0) { wasteExpired += val; expiredCount += 1; }
        else if (d <= 7) { atRiskSoon += val; expiringSoonCount += 1; }
      }
    }

    // ── Sales & margin ──
    const revenue     = r2(margin?.overall?.revenue || 0);
    const revenuePrev = r2(marginPrev?.overall?.revenue || 0);
    const grossProfit = r2(margin?.overall?.grossProfit || 0);
    const marginPct   = r2(margin?.overall?.margin || 0);

    const pctChange = (cur, prev) => (prev > 0 ? r2(((cur - prev) / prev) * 100) : null);

    res.json({
      success: true,
      period: { start, end, label: 'Last 7 days' },
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
        expired: r2(wasteExpired),
        atRiskSoon: r2(atRiskSoon),
        expiredCount,
        expiringSoonCount,
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
