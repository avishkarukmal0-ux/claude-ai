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

module.exports = router;
