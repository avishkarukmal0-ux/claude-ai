'use strict';

const express = require('express');
const router = express.Router();
const Customer = require('../models/Customer');
const Sale = require('../models/Sale');
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');
const loyaltyService = require('../services/loyaltyService');
const { generateCustomerCode } = require('../utils/helpers');

// GET /api/customers/lookup/:query  — POS quick search
router.get('/lookup/:query', async (req, res, next) => {
  try {
    const q = req.params.query;
    const customers = await Customer.find({
      store: req.storeId,
      isActive: true,
      $or: [
        { phone: new RegExp(q, 'i') },
        { customerCode: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
      ],
    }).limit(5).select('-loyalty.pointsHistory');
    res.json({ success: true, customers });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers
router.get('/', async (req, res, next) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const query = { store: req.storeId, isActive: true };
    if (search) {
      query.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { customerCode: new RegExp(search, 'i') },
      ];
    }
    const [customers, total] = await Promise.all([
      Customer.find(query).select('-loyalty.pointsHistory').sort({ lastName: 1 }).skip((page - 1) * limit).limit(parseInt(limit)),
      Customer.countDocuments(query),
    ]);
    res.json({ success: true, customers, total });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, store: req.storeId });
    if (!customer) return next(AppError.notFound('Customer'));
    res.json({ success: true, customer });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/history
router.get('/:id/history', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [sales, total] = await Promise.all([
      Sale.find({ customer: req.params.id, store: req.storeId })
        .sort({ completedAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .select('receiptNumber total status completedAt items.name items.quantity staffName'),
      Sale.countDocuments({ customer: req.params.id, store: req.storeId }),
    ]);
    res.json({ success: true, sales, total });
  } catch (err) {
    next(err);
  }
});

// GET /api/customers/:id/points
router.get('/:id/points', async (req, res, next) => {
  try {
    const balance = await loyaltyService.getPointsBalance(req.params.id);
    const history = await loyaltyService.getPointsHistory(req.params.id, 30);
    res.json({ success: true, ...balance, history });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers
router.post('/', async (req, res, next) => {
  try {
    const customerCode = generateCustomerCode();
    const customer = await Customer.create({
      store: req.storeId,
      customerCode,
      ...req.body,
      'loyalty.enrolled': true,
      'loyalty.joinedAt': new Date(),
    });
    res.status(201).json({ success: true, customer });
  } catch (err) {
    next(err);
  }
});

// PUT /api/customers/:id
router.put('/:id', async (req, res, next) => {
  try {
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!customer) return next(AppError.notFound('Customer'));
    res.json({ success: true, customer });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers/:id/points/earn
router.post('/:id/points/earn', requireRole('manager'), async (req, res, next) => {
  try {
    const { points, reason } = req.body;
    const newBalance = await loyaltyService.adjustPoints(req.params.id, points, reason || 'Manual award', req.user._id);
    res.json({ success: true, newBalance });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers/:id/points/redeem
router.post('/:id/points/redeem', async (req, res, next) => {
  try {
    const { pointsToRedeem } = req.body;
    const store = req.store;
    const result = await loyaltyService.redeemPoints(req.params.id, pointsToRedeem, null, store ? store.settings : {});
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// POST /api/customers/:id/loyalty — manual loyalty point adjustment (used by LoyaltyPage)
router.post('/:id/loyalty', requireRole('manager'), async (req, res, next) => {
  try {
    const { points, reason } = req.body;
    if (points == null) return next(AppError.validationError('points is required'));
    const newBalance = await loyaltyService.adjustPoints(
      req.params.id,
      Number(points),
      reason || 'Manual adjustment',
      req.user._id
    );
    res.json({ success: true, newBalance });
  } catch (err) {
    next(err);
  }
});

// ── Customer Segmentation (#117) ─────────────────────────────────────────────

// GET /api/customers/segments — group customers by spend/frequency/tier
router.get('/segments', requireRole('supervisor'), async (req, res, next) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [tierStats, spendBands, recentVsInactive] = await Promise.all([
      Customer.aggregate([
        { $match: { store: req.storeId, isActive: true } },
        { $group: { _id: '$loyalty.tier', count: { $sum: 1 }, avgPoints: { $avg: '$loyalty.points' }, avgSpend: { $avg: '$stats.totalSpend' } } },
        { $sort: { _id: 1 } },
      ]),
      Customer.aggregate([
        { $match: { store: req.storeId, isActive: true } },
        {
          $bucket: {
            groupBy: '$stats.totalSpend',
            boundaries: [0, 50, 200, 500, 1000, 5000],
            default: '5000+',
            output: { count: { $sum: 1 } },
          },
        },
      ]),
      Customer.aggregate([
        { $match: { store: req.storeId, isActive: true } },
        {
          $group: {
            _id: { $cond: [{ $gte: ['$stats.lastVisitAt', thirtyDaysAgo] }, 'active', 'inactive'] },
            count: { $sum: 1 },
            avgSpend: { $avg: '$stats.totalSpend' },
          },
        },
      ]),
    ]);

    res.json({ success: true, byTier: tierStats, bySpend: spendBands, activeVsInactive: recentVsInactive });
  } catch (err) { next(err); }
});

// ── Birthday Rewards (#111) ──────────────────────────────────────────────────

// GET /api/customers/birthday-eligible — customers whose birthday month is current
router.get('/birthday-eligible', requireRole('supervisor'), async (req, res, next) => {
  try {
    const month = new Date().getMonth() + 1;
    const customers = await Customer.find({
      store: req.storeId,
      isActive: true,
      $expr: { $eq: [{ $month: '$dateOfBirth' }, month] },
    }).select('firstName lastName email phone loyalty dateOfBirth').limit(100);
    res.json({ success: true, month, customers });
  } catch (err) { next(err); }
});

// POST /api/customers/birthday-rewards — auto-award birthday bonus points (#111)
router.post('/birthday-rewards', requireRole('manager'), async (req, res, next) => {
  try {
    const { bonusPoints = 100 } = req.body;
    const month = new Date().getMonth() + 1;

    const customers = await Customer.find({
      store: req.storeId,
      isActive: true,
      $expr: { $eq: [{ $month: '$dateOfBirth' }, month] },
      'loyalty.birthdayBonusAwardedYear': { $ne: new Date().getFullYear() },
    });

    let awarded = 0;
    for (const c of customers) {
      try {
        await loyaltyService.adjustPoints(c._id, bonusPoints, `Birthday bonus — ${new Date().getFullYear()}`, req.user._id);
        c.loyalty.birthdayBonusAwardedYear = new Date().getFullYear();
        await c.save();
        awarded++;
      } catch { /* skip individual failures */ }
    }

    res.json({ success: true, eligible: customers.length, awarded, bonusPoints });
  } catch (err) { next(err); }
});

// ── Account Payment for Trade Customers (#119) ───────────────────────────────

// GET /api/customers/:id/account — get credit account info
router.get('/:id/account', async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ _id: req.params.id, store: req.storeId })
      .select('firstName lastName customerCode account');
    if (!customer) return next(AppError.notFound('Customer'));
    res.json({ success: true, customer });
  } catch (err) { next(err); }
});

// PUT /api/customers/:id/account — set credit limit / enable account
router.put('/:id/account', requireRole('manager'), async (req, res, next) => {
  try {
    const { creditLimit, isTradeAccount, paymentTermsDays } = req.body;
    const customer = await Customer.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      {
        'account.isTradeAccount': isTradeAccount,
        'account.creditLimit': creditLimit,
        'account.paymentTermsDays': paymentTermsDays || 30,
      },
      { new: true }
    );
    if (!customer) return next(AppError.notFound('Customer'));
    res.json({ success: true, customer });
  } catch (err) { next(err); }
});

// POST /api/customers/:id/account/payment — record account payment
router.post('/:id/account/payment', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { amount, method = 'bank_transfer', reference, notes } = req.body;
    const customer = await Customer.findOne({ _id: req.params.id, store: req.storeId });
    if (!customer) return next(AppError.notFound('Customer'));

    const currentBalance = customer.account?.balance || 0;
    const newBalance = Number((currentBalance - Number(amount)).toFixed(2));

    await Customer.findByIdAndUpdate(req.params.id, {
      'account.balance': newBalance,
      $push: {
        'account.payments': {
          amount: Number(amount),
          method,
          reference,
          notes,
          recordedBy: req.user._id,
          recordedByName: req.user.displayName,
          recordedAt: new Date(),
        },
      },
    });

    res.json({ success: true, previousBalance: currentBalance, payment: Number(amount), newBalance });
  } catch (err) { next(err); }
});

module.exports = router;
