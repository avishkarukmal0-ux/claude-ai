'use strict';

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Product = require('../models/Product');
const Sale = require('../models/Sale');
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');

// In-memory age approval flags keyed by storeId (auto-clears on read)
const ageApprovals = new Map();

// POST /api/pos/self-checkout/start — requireRole manager
router.post('/start', requireRole('manager'), async (req, res, next) => {
  try {
    const { tillId } = req.body;
    if (!tillId) return next(AppError.validationError('tillId is required'));

    const sessionId = uuidv4();

    if (req.io) {
      req.io.to(`store:${req.storeId}`).emit('selfcheckout:activated', {
        tillId,
        activatedBy: req.user.displayName || req.user._id,
        sessionId,
      });
    }

    res.json({ success: true, sessionId, tillId });
  } catch (err) {
    next(err);
  }
});

// POST /api/pos/self-checkout/scan — authenticated (no special role)
router.post('/scan', async (req, res, next) => {
  try {
    const { sessionId, barcode, storeId } = req.body;
    if (!barcode) return next(AppError.validationError('barcode is required'));

    const resolvedStoreId = req.storeId || storeId;

    const product = await Product.findOne({
      store: resolvedStoreId,
      barcode,
      isActive: true,
    }).lean();

    if (!product) return next(AppError.notFound('Product'));

    const requiresAgeCheck = !!(product.attributes && product.attributes.ageRestricted);

    if (requiresAgeCheck) {
      if (req.io) {
        req.io.to(`store:${resolvedStoreId}`).emit('selfcheckout:age_check_required', {
          sessionId,
          product,
          tillId: req.body.tillId || null,
        });
      }
      return res.json({ success: true, product, requiresAgeCheck: true });
    }

    if (req.io) {
      req.io.to(`store:${resolvedStoreId}`).emit('selfcheckout:item_added', {
        sessionId,
        product,
      });
    }

    res.json({ success: true, product, requiresAgeCheck: false });
  } catch (err) {
    next(err);
  }
});

// POST /api/pos/self-checkout/approve-age — requireRole supervisor
router.post('/approve-age', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { sessionId, productId } = req.body;
    if (!sessionId || !productId) {
      return next(AppError.validationError('sessionId and productId are required'));
    }

    if (req.io) {
      req.io.to(`store:${req.storeId}`).emit('selfcheckout:age_approved', {
        sessionId,
        productId,
        approvedBy: req.user.displayName || req.user._id,
      });
    }

    // Set polling flag so GET /age-check-status returns approved
    ageApprovals.set(req.storeId.toString(), true);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/pos/self-checkout/age-check-status — polled by SelfCheckoutPage while waiting for supervisor
router.get('/age-check-status', async (req, res) => {
  const storeKey = req.storeId.toString();
  const approved = ageApprovals.get(storeKey) || false;
  if (approved) ageApprovals.delete(storeKey); // consume the flag
  res.json({ success: true, approved });
});

// POST /api/pos/self-checkout/pay — authenticated
router.post('/pay', async (req, res, next) => {
  try {
    const { sessionId, items, total, tillId } = req.body;
    if (!items || !Array.isArray(items)) return next(AppError.validationError('items array is required'));
    if (total === undefined) return next(AppError.validationError('total is required'));

    const resolvedTillId = tillId || 'SELF-CHECKOUT-1';

    // Build sale items
    const saleItems = items.map((item) => ({
      product: item.product || item._id,
      barcode: item.barcode,
      name: item.name,
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || item.pricing?.retailPrice || 0,
      costPrice: item.costPrice || item.pricing?.costPrice || 0,
      lineTotal: item.lineTotal || (item.quantity || 1) * (item.unitPrice || item.pricing?.retailPrice || 0),
      vatRate: item.vatRate || item.pricing?.vatRate || 'zero',
      vatAmount: 0,
    }));

    const subtotal = Math.round(saleItems.reduce((s, i) => s + (i.lineTotal || 0), 0) * 100) / 100;

    // Generate receipt number
    const now = new Date();
    const datePrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayCount = await Sale.countDocuments({ store: req.storeId, createdAt: { $gte: dayStart } });
    const receiptNumber = `${datePrefix}-${String(todayCount + 1).padStart(4, '0')}`;

    const sale = await Sale.create({
      store: req.storeId,
      tillId: resolvedTillId,
      receiptNumber,
      staff: req.user._id,
      staffName: req.user.displayName || 'Self-Checkout',
      items: saleItems,
      subtotal,
      discountTotal: 0,
      vatBreakdown: [],
      total: Number(total),
      payments: [{ method: 'card', amount: Number(total) }],
      status: 'completed',
      isTraining: false,
      completedAt: now,
    });

    res.json({ success: true, sale, receiptNumber: sale.receiptNumber });
  } catch (err) {
    next(err);
  }
});

// POST /api/pos/self-checkout/cancel — authenticated
router.post('/cancel', async (req, res, next) => {
  try {
    const { sessionId } = req.body;

    if (req.io) {
      req.io.to(`store:${req.storeId}`).emit('selfcheckout:cancelled', { sessionId });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
