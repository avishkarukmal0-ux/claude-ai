'use strict';

const express = require('express');
const router = express.Router();
const NoSaleLog = require('../models/NoSaleLog');
const ScanPattern = require('../models/ScanPattern');
const DiscountPattern = require('../models/DiscountPattern');
const Incident = require('../models/Incident');
const ShrinkageLog = require('../models/ShrinkageLog');
const CustomerWatchlist = require('../models/CustomerWatchlist');
const ReceiptVerification = require('../models/ReceiptVerification');
const AgeRefusal = require('../models/AgeRefusal');
const lossPreventionService = require('../services/lossPreventionService');
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');
const { todayStart, todayEnd } = require('../utils/helpers');
const smsService = require('../services/smsService');

// GET /api/loss-prevention/dashboard
router.get('/dashboard', requireRole('supervisor'), async (req, res, next) => {
  try {
    const [noSalesToday, openPatterns, recentIncidents] = await Promise.all([
      NoSaleLog.countDocuments({ store: req.storeId, occurredAt: { $gte: todayStart() } }),
      ScanPattern.countDocuments({ store: req.storeId, status: 'pending' }),
      Incident.find({ store: req.storeId, status: { $in: ['open','investigating'] } }).limit(5).sort({ occurredAt: -1 }),
    ]);
    res.json({ success: true, noSalesToday, openPatterns, recentIncidents });
  } catch (err) { next(err); }
});

// GET /api/loss-prevention/no-sales
router.get('/no-sales', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { staffId, from, to, flagged } = req.query;
    const query = { store: req.storeId };
    if (staffId) query.staff = staffId;
    if (flagged !== undefined) query.flagged = flagged === 'true';
    if (from || to) { query.occurredAt = {}; if (from) query.occurredAt.$gte = new Date(from); if (to) query.occurredAt.$lte = new Date(to); }
    const logs = await NoSaleLog.find(query).sort({ occurredAt: -1 }).limit(100).populate('staff', 'displayName');
    res.json({ success: true, logs });
  } catch (err) { next(err); }
});

// POST /api/loss-prevention/no-sales
router.post('/no-sales', async (req, res, next) => {
  try {
    const { tillId, reason, customReason } = req.body;
    const log = await NoSaleLog.create({ store: req.storeId, tillId: tillId || 'TILL-1', staff: req.user._id, staffName: req.user.displayName, reason, customReason, occurredAt: new Date() });
    if (req.io) req.io.to(`store:${req.storeId}`).emit('drawer:opened', { tillId, staffName: req.user.displayName, reason });
    res.status(201).json({ success: true, log });
  } catch (err) { next(err); }
});

// PUT /api/loss-prevention/no-sales/:id/flag
router.put('/no-sales/:id/flag', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { flagReason } = req.body;
    const log = await NoSaleLog.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, { flagged: true, flagReason, reviewedBy: req.user._id }, { new: true });
    res.json({ success: true, log });
  } catch (err) { next(err); }
});

// GET/PUT scan-patterns
router.get('/scan-patterns', requireRole('supervisor'), async (req, res, next) => {
  try {
    const patterns = await ScanPattern.find({ store: req.storeId }).sort({ detectedAt: -1 }).limit(100);
    res.json({ success: true, patterns });
  } catch (err) { next(err); }
});

router.put('/scan-patterns/:id/review', requireRole('supervisor'), async (req, res, next) => {
  try {
    const pattern = await ScanPattern.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, { status: req.body.status || 'reviewed', reviewedBy: req.user._id, reviewedAt: new Date(), reviewNotes: req.body.notes }, { new: true });
    res.json({ success: true, pattern });
  } catch (err) { next(err); }
});

// GET/PUT discount-patterns
router.get('/discount-patterns', requireRole('supervisor'), async (req, res, next) => {
  try {
    const patterns = await DiscountPattern.find({ store: req.storeId }).sort({ createdAt: -1 }).limit(100);
    res.json({ success: true, patterns });
  } catch (err) { next(err); }
});

router.put('/discount-patterns/:id/review', requireRole('supervisor'), async (req, res, next) => {
  try {
    const pattern = await DiscountPattern.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, { status: req.body.status || 'reviewed', reviewedBy: req.user._id, reviewedAt: new Date(), reviewNotes: req.body.notes }, { new: true });
    res.json({ success: true, pattern });
  } catch (err) { next(err); }
});

// POST /api/loss-prevention/receipt-verify
router.post('/receipt-verify', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { receiptNumber, method } = req.body;
    const Sale = require('../models/Sale');
    const sale = await Sale.findOne({ receiptNumber, store: req.storeId });
    const result = sale ? 'matched' : 'not_found';
    const verification = await ReceiptVerification.create({ store: req.storeId, sale: sale ? sale._id : undefined, receiptNumber, verifiedBy: req.user._id, verifiedByName: req.user.displayName, method: method || 'manual_entry', result, occurredAt: new Date() });
    res.json({ success: true, verification, sale });
  } catch (err) { next(err); }
});

router.get('/receipt-verifications', requireRole('supervisor'), async (req, res, next) => {
  try {
    const list = await ReceiptVerification.find({ store: req.storeId }).sort({ occurredAt: -1 }).limit(50);
    res.json({ success: true, list });
  } catch (err) { next(err); }
});

// Shrinkage
router.get('/shrinkage', requireRole('supervisor'), async (req, res, next) => {
  try {
    const logs = await ShrinkageLog.find({ store: req.storeId }).sort({ occurredAt: -1 }).limit(100);
    res.json({ success: true, logs });
  } catch (err) { next(err); }
});

router.post('/shrinkage', requireRole('supervisor'), async (req, res, next) => {
  try {
    const log = await ShrinkageLog.create({ store: req.storeId, discoveredBy: req.user._id, discoveredByName: req.user.displayName, ...req.body });
    res.status(201).json({ success: true, log });
  } catch (err) { next(err); }
});

// Incidents
router.get('/incidents', requireRole('supervisor'), async (req, res, next) => {
  try {
    const incidents = await Incident.find({ store: req.storeId }).sort({ occurredAt: -1 }).limit(100);
    res.json({ success: true, incidents });
  } catch (err) { next(err); }
});

router.post('/incidents', async (req, res, next) => {
  try {
    const incident = await Incident.create({ store: req.storeId, reportedBy: req.user._id, reportedByName: req.user.displayName, ...req.body });
    res.status(201).json({ success: true, incident });
  } catch (err) { next(err); }
});

router.put('/incidents/:id', async (req, res, next) => {
  try {
    const incident = await Incident.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, req.body, { new: true });
    if (!incident) return next(AppError.notFound('Incident'));
    res.json({ success: true, incident });
  } catch (err) { next(err); }
});

// Watchlist
router.get('/watchlist', requireRole('supervisor'), async (req, res, next) => {
  try {
    const list = await CustomerWatchlist.find({ store: req.storeId, status: 'active' });
    res.json({ success: true, list });
  } catch (err) { next(err); }
});

router.post('/watchlist', requireRole('supervisor'), async (req, res, next) => {
  try {
    const entry = await CustomerWatchlist.create({ store: req.storeId, addedBy: req.user._id, ...req.body });
    res.status(201).json({ success: true, entry });
  } catch (err) { next(err); }
});

router.delete('/watchlist/:id', requireRole('supervisor'), async (req, res, next) => {
  try {
    await CustomerWatchlist.findOneAndUpdate({ _id: req.params.id, store: req.storeId }, { status: 'removed' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Exception report
router.get('/exception-report', requireRole('supervisor'), async (req, res, next) => {
  try {
    const [noSales, patterns, incidents, shrinkage] = await Promise.all([
      NoSaleLog.countDocuments({ store: req.storeId, occurredAt: { $gte: todayStart() } }),
      ScanPattern.countDocuments({ store: req.storeId, status: 'pending', detectedAt: { $gte: todayStart() } }),
      Incident.countDocuments({ store: req.storeId, occurredAt: { $gte: todayStart() } }),
      ShrinkageLog.countDocuments({ store: req.storeId, occurredAt: { $gte: todayStart() } }),
    ]);
    res.json({ success: true, date: new Date(), noSales, patterns, incidents, shrinkage });
  } catch (err) { next(err); }
});

// ── Age Refusal Logging (#22) ────────────────────────────────────────────────

// POST /api/loss-prevention/age-refusals
router.post('/age-refusals', async (req, res, next) => {
  try {
    const refusal = await AgeRefusal.create({
      store: req.storeId,
      staff: req.user._id,
      staffName: req.user.displayName,
      tillId: req.body.tillId || 'TILL-1',
      productId: req.body.productId,
      productName: req.body.productName,
      productBarcode: req.body.productBarcode,
      minimumAge: req.body.minimumAge || 18,
      refusalReason: req.body.refusalReason || 'no_id',
      refusalNotes: req.body.refusalNotes,
      occurredAt: new Date(),
    });
    res.status(201).json({ success: true, refusal });
  } catch (err) { next(err); }
});

// GET /api/loss-prevention/age-refusals — compliance audit report (#25)
router.get('/age-refusals', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { from, to, staffId, limit = 200, page = 1 } = req.query;
    const query = { store: req.storeId };
    if (staffId) query.staff = staffId;
    if (from || to) {
      query.occurredAt = {};
      if (from) query.occurredAt.$gte = new Date(from);
      if (to) query.occurredAt.$lte = new Date(to);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [refusals, total] = await Promise.all([
      AgeRefusal.find(query).sort({ occurredAt: -1 }).skip(skip).limit(Number(limit)).populate('staff', 'displayName employeeId'),
      AgeRefusal.countDocuments(query),
    ]);
    res.json({ success: true, refusals, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// GET /api/loss-prevention/age-refusals/stats — C25 statistics (#26)
router.get('/age-refusals/stats', requireRole('supervisor'), async (req, res, next) => {
  try {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 3600 * 1000);

    const [totalThisWeek, totalThisMonth, byStaffWeek, byReasonWeek, byStaffMonth] = await Promise.all([
      AgeRefusal.countDocuments({ store: req.storeId, occurredAt: { $gte: weekAgo } }),
      AgeRefusal.countDocuments({ store: req.storeId, occurredAt: { $gte: monthAgo } }),
      AgeRefusal.aggregate([
        { $match: { store: req.storeId, occurredAt: { $gte: weekAgo } } },
        { $group: { _id: '$staffName', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 10 },
      ]),
      AgeRefusal.aggregate([
        { $match: { store: req.storeId, occurredAt: { $gte: weekAgo } } },
        { $group: { _id: '$refusalReason', count: { $sum: 1 } } },
      ]),
      AgeRefusal.aggregate([
        { $match: { store: req.storeId, occurredAt: { $gte: monthAgo } } },
        { $group: { _id: '$staffName', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 10 },
      ]),
    ]);

    res.json({
      success: true,
      thisWeek: { total: totalThisWeek, byStaff: byStaffWeek, byReason: byReasonWeek },
      thisMonth: { total: totalThisMonth, byStaff: byStaffMonth },
    });
  } catch (err) { next(err); }
});

// ── Transaction Replay (#43) ─────────────────────────────────────────────────

// GET /api/loss-prevention/transaction-replay/:saleId
router.get('/transaction-replay/:saleId', requireRole('supervisor'), async (req, res, next) => {
  try {
    const Sale = require('../models/Sale');
    const sale = await Sale.findOne({ _id: req.params.saleId, store: req.storeId })
      .populate('items.productId', 'name barcode category')
      .populate('staff', 'displayName employeeId');
    if (!sale) return next(AppError.notFound('Sale'));

    // Build scan timeline from items with scanTime
    const timeline = (sale.items || []).map((item, idx) => ({
      seq: idx + 1,
      time: item.scanTime || sale.createdAt,
      barcode: item.barcode || item.productId?.barcode,
      productName: item.productId?.name || item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      ageVerified: item.ageVerified,
    })).sort((a, b) => new Date(a.time) - new Date(b.time));

    res.json({
      success: true,
      sale: {
        _id: sale._id,
        receiptNumber: sale.receiptNumber,
        createdAt: sale.createdAt,
        total: sale.total,
        subtotal: sale.subtotal,
        payments: sale.payments,
        staffName: sale.staff?.displayName || sale.staffName,
        tillId: sale.tillId,
        cctvReference: sale.cctvReference || null,
        isVoid: sale.isVoid,
        isRefund: sale.isRefund,
        isTraining: sale.isTraining,
      },
      timeline,
    });
  } catch (err) { next(err); }
});

// PUT /api/loss-prevention/transaction-replay/:saleId/cctv — store CCTV reference
router.put('/transaction-replay/:saleId/cctv', requireRole('supervisor'), async (req, res, next) => {
  try {
    const Sale = require('../models/Sale');
    const sale = await Sale.findOneAndUpdate(
      { _id: req.params.saleId, store: req.storeId },
      { cctvReference: req.body.cctvReference },
      { new: true }
    );
    res.json({ success: true, cctvReference: sale?.cctvReference });
  } catch (err) { next(err); }
});

// ── Panic (with SMS) ─────────────────────────────────────────────────────────

// Panic
router.post('/panic', async (req, res, next) => {
  try {
    const { tillId } = req.body;
    await lossPreventionService.triggerPanic(req.user._id, tillId || 'TILL-1', req.storeId, req.io);

    // Fire SMS alert (#165) — non-blocking
    const Store = require('../models/Store');
    Store.findById(req.storeId).select('name address').then(store => {
      smsService.sendPanicAlert({
        storeName: store?.name || 'Store',
        tillId: tillId || 'TILL-1',
        staffName: req.user.displayName,
        location: store?.address?.line1 || '',
      }).catch(() => {});
    }).catch(() => {});

    res.json({ success: true, message: 'Panic alert triggered' });
  } catch (err) { next(err); }
});

// Lone worker
router.post('/lone-worker/start', async (req, res, next) => {
  try {
    const { tillId, settings } = req.body;
    const session = await lossPreventionService.startLoneWorkerSession(req.user._id, req.storeId, tillId, settings);
    res.json({ success: true, session });
  } catch (err) { next(err); }
});

router.post('/lone-worker/checkin', async (req, res, next) => {
  try {
    const session = await lossPreventionService.loneWorkerCheckin(req.user._id, req.storeId);
    res.json({ success: true, session });
  } catch (err) { next(err); }
});

router.post('/lone-worker/end', async (req, res, next) => {
  try {
    const session = await lossPreventionService.endLoneWorkerSession(req.user._id, req.storeId);
    res.json({ success: true, session });
  } catch (err) { next(err); }
});

// LP settings
router.get('/settings', requireRole('supervisor'), async (req, res, next) => {
  try {
    const store = await require('../models/Store').findById(req.storeId).select('lpSettings');
    res.json({ success: true, settings: store ? store.lpSettings : {} });
  } catch (err) { next(err); }
});

router.put('/settings', requireRole('manager'), async (req, res, next) => {
  try {
    const store = await require('../models/Store').findByIdAndUpdate(req.storeId, { lpSettings: req.body }, { new: true });
    res.json({ success: true, settings: store.lpSettings });
  } catch (err) { next(err); }
});

module.exports = router;
