'use strict';

const express = require('express');
const router = express.Router();
const cashDrawerService = require('../services/cashDrawerService');
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');

// GET /api/cash-drawer/state/:tillId
router.get('/state/:tillId', async (req, res, next) => {
  try {
    const drawer = await require('../models/CashDrawer').getDrawer(req.storeId, req.params.tillId);
    res.json({ success: true, drawer });
  } catch (err) { next(err); }
});

// GET /api/cash-drawer/all
router.get('/all', requireRole('manager'), async (req, res, next) => {
  try {
    const drawers = await require('../models/CashDrawer').find({ store: req.storeId });
    res.json({ success: true, drawers });
  } catch (err) { next(err); }
});

// POST /api/cash-drawer/open-day
router.post('/open-day', async (req, res, next) => {
  try {
    const { tillId = 'TILL-1', openingFloat, notes } = req.body;
    const drawer = await cashDrawerService.openDay(req.storeId, tillId, openingFloat, req.user._id, req.user.displayName);
    res.json({ success: true, drawer });
  } catch (err) { next(err); }
});

// POST /api/cash-drawer/close-day
router.post('/close-day', async (req, res, next) => {
  try {
    const { tillId = 'TILL-1', declaredAmount, denominations } = req.body;
    const drawer = await cashDrawerService.closeDay(req.storeId, tillId, declaredAmount, denominations, req.user._id, req.user.displayName);
    res.json({ success: true, drawer });
  } catch (err) { next(err); }
});

// POST /api/cash-drawer/safe-drop
router.post('/safe-drop', async (req, res, next) => {
  try {
    const { tillId = 'TILL-1', amount, notes } = req.body;
    await cashDrawerService.recordSafeDrop(req.storeId, tillId, amount, req.user._id, req.user.displayName, notes);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/cash-drawer/payout
router.post('/payout', async (req, res, next) => {
  try {
    const { tillId = 'TILL-1', amount, description } = req.body;
    await cashDrawerService.recordPayout(req.storeId, tillId, amount, req.user._id, req.user.displayName, description);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/cash-drawer/cash-received
router.post('/cash-received', async (req, res, next) => {
  try {
    const { tillId = 'TILL-1', amount, description } = req.body;
    const CashActivity = require('../models/CashActivity');
    const CashDrawer = require('../models/CashDrawer');
    const drawer = await CashDrawer.getDrawer(req.storeId, tillId);
    drawer.sessionTotals.cashReceived += amount;
    drawer.expectedAmount = drawer.calculateExpected();
    await drawer.save();
    await CashActivity.create({ store: req.storeId, tillId, type: 'cash_received', amount, balanceAfter: drawer.expectedAmount, staff: req.user._id, staffName: req.user.displayName, description, occurredAt: new Date() });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/cash-drawer/drawer-open
router.post('/drawer-open', async (req, res, next) => {
  try {
    const { tillId = 'TILL-1', reason } = req.body;
    const NoSaleLog = require('../models/NoSaleLog');
    await NoSaleLog.create({ store: req.storeId, tillId, staff: req.user._id, staffName: req.user.displayName, reason: reason || 'other', occurredAt: new Date() });
    if (req.io) req.io.to(`store:${req.storeId}`).emit('drawer:opened', { tillId, staffName: req.user.displayName, reason });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/cash-drawer/quick-confirm
router.post('/quick-confirm', async (req, res, next) => {
  try {
    const { tillId = 'TILL-1' } = req.body;
    await cashDrawerService.quickConfirm(req.storeId, tillId, req.user._id, req.user.displayName);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/cash-drawer/full-count
router.post('/full-count', async (req, res, next) => {
  try {
    const { tillId = 'TILL-1', denominations } = req.body;
    const result = await cashDrawerService.fullCount(req.storeId, tillId, denominations, req.user._id, req.user.displayName);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// GET /api/cash-drawer/expected-denominations/:tillId
router.get('/expected-denominations/:tillId', async (req, res, next) => {
  try {
    const CashDrawer = require('../models/CashDrawer');
    const drawer = await CashDrawer.getDrawer(req.storeId, req.params.tillId);
    const amount = drawer.expectedAmount;
    // Suggest optimal denomination breakdown
    const breakdown = { notes: { fifty: 0, twenty: 0, ten: 0, five: 0 }, coins: { twoPound: 0, onePound: 0, fiftyP: 0, twentyP: 0, tenP: 0, fiveP: 0, twoP: 0, oneP: 0 } };
    let remaining = Math.round(amount * 100);
    const denoms = [[5000,'notes.fifty'],[2000,'notes.twenty'],[1000,'notes.ten'],[500,'notes.five'],[200,'coins.twoPound'],[100,'coins.onePound'],[50,'coins.fiftyP'],[20,'coins.twentyP'],[10,'coins.tenP'],[5,'coins.fiveP'],[2,'coins.twoP'],[1,'coins.oneP']];
    for (const [val, path] of denoms) {
      const count = Math.floor(remaining / val);
      if (count > 0) { const parts = path.split('.'); breakdown[parts[0]][parts[1]] = count; remaining -= count * val; }
    }
    res.json({ success: true, expectedAmount: amount, breakdown });
  } catch (err) { next(err); }
});

// GET /api/cash-drawer/activity/:tillId/today
router.get('/activity/:tillId/today', async (req, res, next) => {
  try {
    const activity = await cashDrawerService.getActivityLog(req.storeId, req.params.tillId, new Date());
    res.json({ success: true, activity: Array.isArray(activity) ? activity : [] });
  } catch (err) { next(err); }
});

// GET /api/cash-drawer/summary/:tillId
router.get('/summary/:tillId', async (req, res, next) => {
  try {
    const summary = await cashDrawerService.getTodaySummary(req.storeId, req.params.tillId);
    res.json({ success: true, summary });
  } catch (err) { next(err); }
});

// GET /api/cash-drawer/variance-history
router.get('/variance-history', requireRole('manager'), async (req, res, next) => {
  try {
    const CashActivity = require('../models/CashActivity');
    const variances = await CashActivity.find({ store: req.storeId, type: { $in: ['full_count', 'quick_confirm'] }, variance: { $exists: true } }).sort({ occurredAt: -1 }).limit(50);
    res.json({ success: true, variances });
  } catch (err) { next(err); }
});

// POST /api/cash-drawer/handover/initiate
router.post('/handover/initiate', async (req, res, next) => {
  try {
    const { tillId = 'TILL-1', incomingStaffId } = req.body;
    const handover = await cashDrawerService.initiateHandover(req.storeId, tillId, req.user._id, incomingStaffId, req.io);
    res.json({ success: true, handover });
  } catch (err) { next(err); }
});

// POST /api/cash-drawer/handover/:id/confirm-outgoing
router.post('/handover/:id/confirm-outgoing', async (req, res, next) => {
  try {
    const { pin } = req.body;
    const handover = await cashDrawerService.confirmOutgoing(req.params.id, pin, req.storeId);
    res.json({ success: true, handover });
  } catch (err) { next(err); }
});

// POST /api/cash-drawer/handover/:id/confirm-incoming
router.post('/handover/:id/confirm-incoming', async (req, res, next) => {
  try {
    const { pin } = req.body;
    const handover = await cashDrawerService.confirmIncoming(req.params.id, pin, req.storeId, req.io);
    res.json({ success: true, handover });
  } catch (err) { next(err); }
});

// GET /api/cash-drawer/handover/pending
router.get('/handover/pending', async (req, res, next) => {
  try {
    const ShiftHandover = require('../models/ShiftHandover');
    const handover = await ShiftHandover.findOne({ store: req.storeId, status: { $in: ['pending', 'outgoing_confirmed'] } });
    res.json({ success: true, handover });
  } catch (err) { next(err); }
});

// ── Blind Cash Count (#48) ───────────────────────────────────────────────────

// POST /api/cash-drawer/blind-count — submit counted amount without seeing expected
router.post('/blind-count', async (req, res, next) => {
  try {
    const { tillId = 'TILL-1', denominations, countedTotal, notes } = req.body;
    const CashDrawer = require('../models/CashDrawer');
    const CashActivity = require('../models/CashActivity');

    const drawer = await CashDrawer.getDrawer(req.storeId, tillId);
    const expected = drawer.expectedAmount || 0;
    const variance = Number((countedTotal - expected).toFixed(2));

    await CashActivity.create({
      store: req.storeId,
      tillId,
      type: 'blind_count',
      amount: countedTotal,
      balanceAfter: countedTotal,
      variance,
      denominations,
      staff: req.user._id,
      staffName: req.user.displayName,
      description: notes || 'Blind cash count',
      occurredAt: new Date(),
    });

    res.json({
      success: true,
      countedTotal,
      expected,
      variance,
      varianceLabel: variance === 0 ? 'exact' : variance > 0 ? 'over' : 'under',
    });
  } catch (err) { next(err); }
});

module.exports = router;
