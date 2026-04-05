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

module.exports = router;
