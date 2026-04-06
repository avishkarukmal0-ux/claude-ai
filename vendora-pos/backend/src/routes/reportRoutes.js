'use strict';

const express = require('express');
const router = express.Router();
const reportService = require('../services/reportService');
const ReportSchedule = require('../models/ReportSchedule');
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');

router.get('/x-report/:tillId', requireRole('supervisor'), async (req, res, next) => {
  try {
    const report = await reportService.getXReport(req.storeId, req.params.tillId);
    res.json({ success: true, report });
  } catch (err) { next(err); }
});

router.get('/z-report/:tillId', requireRole('manager'), async (req, res, next) => {
  try {
    const report = await reportService.getZReport(req.storeId, req.params.tillId, req.user._id);
    res.json({ success: true, report });
  } catch (err) { next(err); }
});

router.get('/summary', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { date, from, to } = req.query;
    const report = date
      ? await reportService.getDailySummary(req.storeId, date)
      : await reportService.getDailySummary(req.storeId, new Date().toISOString().split('T')[0]);
    res.json({ success: true, report });
  } catch (err) { next(err); }
});

router.get('/category', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const data = await reportService.getCategoryBreakdown(req.storeId, from, to);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/products', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { from, to, limit } = req.query;
    const data = await reportService.getProductPerformance(req.storeId, from, to, parseInt(limit) || 20);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/staff', requireRole('manager'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const data = await reportService.getStaffPerformance(req.storeId, from, to);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/hourly', requireRole('supervisor'), async (req, res, next) => {
  try {
    const data = await reportService.getHourlyBreakdown(req.storeId, req.query.date);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/margins', requireRole('manager'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const data = await reportService.getMarginAnalysis(req.storeId, from, to);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/comparison', requireRole('manager'), async (req, res, next) => {
  try {
    const { p1Start, p1End, p2Start, p2End } = req.query;
    const data = await reportService.getPeriodComparison(req.storeId, p1Start, p1End, p2Start, p2End);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.get('/export', requireRole('manager'), async (req, res, next) => {
  try {
    const { from, to, format = 'csv' } = req.query;
    const data = await reportService.getDailySummary(req.storeId, from);
    res.json({ success: true, data, format });
  } catch (err) { next(err); }
});

router.get('/schedules', requireRole('manager'), async (req, res, next) => {
  try {
    const schedules = await ReportSchedule.find({ store: req.storeId });
    res.json({ success: true, schedules });
  } catch (err) { next(err); }
});

router.post('/schedules', requireRole('manager'), async (req, res, next) => {
  try {
    const schedule = await ReportSchedule.create({ store: req.storeId, ...req.body });
    res.status(201).json({ success: true, schedule });
  } catch (err) { next(err); }
});

router.delete('/schedules/:id', requireRole('manager'), async (req, res, next) => {
  try {
    await ReportSchedule.findOneAndDelete({ _id: req.params.id, store: req.storeId });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Custom Report Builder (#139) ─────────────────────────────────────────────

// POST /api/reports/custom
router.post('/custom', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { from, to, metrics = ['revenue', 'transactions'], groupBy = 'day' } = req.body;

    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const Sale = require('../models/Sale');

    const groupFormats = {
      day:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      week:  { $dateToString: { format: '%Y-W%V', date: '$createdAt' } },
      month: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
      staff: '$staffName',
      till:  '$tillId',
    };

    const groupExpr = groupFormats[groupBy] || groupFormats.day;

    const agg = await Sale.aggregate([
      {
        $match: {
          store: req.storeId,
          createdAt: { $gte: fromDate, $lte: toDate },
          isVoid: { $ne: true },
          isTraining: { $ne: true },
        },
      },
      {
        $group: {
          _id: groupExpr,
          revenue:      { $sum: '$total' },
          transactions: { $sum: 1 },
          avgBasket:    { $avg: '$total' },
          itemsSold:    { $sum: { $sum: '$items.quantity' } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totals = agg.reduce((t, r) => {
      t.revenue += r.revenue;
      t.transactions += r.transactions;
      t.itemsSold += r.itemsSold;
      return t;
    }, { revenue: 0, transactions: 0, itemsSold: 0 });
    totals.avgBasket = totals.transactions > 0 ? totals.revenue / totals.transactions : 0;

    res.json({ success: true, params: { from: fromDate, to: toDate, metrics, groupBy }, rows: agg, totals });
  } catch (err) { next(err); }
});

module.exports = router;
