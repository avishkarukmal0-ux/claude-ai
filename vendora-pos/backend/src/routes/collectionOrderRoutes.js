'use strict';

const express = require('express');
const router = express.Router();
const CollectionOrder = require('../models/CollectionOrder');
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');

// GET /pending-count — before /:id to avoid param conflict
router.get('/pending-count', async (req, res, next) => {
  try {
    const count = await CollectionOrder.countDocuments({
      store: req.storeId,
      status: { $in: ['pending', 'ready'] },
    });
    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
});

// POST / — create order
router.post('/', async (req, res, next) => {
  try {
    const { customerName, customerPhone, items, total, notes, requestedTime } = req.body;
    if (!customerName) return next(AppError.validationError('customerName is required'));

    const order = await CollectionOrder.create({
      store: req.storeId,
      customerName,
      customerPhone,
      items: items || [],
      total,
      notes,
      requestedTime: requestedTime ? new Date(requestedTime) : undefined,
    });

    if (req.io) {
      req.io.to(`store:${req.storeId}`).emit('collection:new', { order });
    }

    res.status(201).json({ success: true, order });
  } catch (err) {
    next(err);
  }
});

// GET / — list orders
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { store: req.storeId };

    if (!status || status === 'all') {
      // Return all
    } else if (status === 'pending' || status === 'ready' || status === 'collected' || status === 'cancelled') {
      query.status = status;
    } else {
      // Default: pending + ready
      query.status = { $in: ['pending', 'ready'] };
    }

    if (!status) {
      query.status = { $in: ['pending', 'ready'] };
    }

    const orders = await CollectionOrder.find(query)
      .sort({ createdAt: -1 })
      .populate('preparedBy', 'displayName')
      .populate('collectedBy', 'displayName');

    res.json({ success: true, orders });
  } catch (err) {
    next(err);
  }
});

// PUT /:id/ready — mark ready (supervisor+)
router.put('/:id/ready', requireRole('supervisor'), async (req, res, next) => {
  try {
    const order = await CollectionOrder.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      { status: 'ready', preparedBy: req.user._id },
      { new: true }
    );
    if (!order) return next(AppError.notFound('CollectionOrder'));

    if (req.io) {
      req.io.to(`store:${req.storeId}`).emit('collection:ready', { order });
    }

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
});

// PUT /:id/collected — mark collected
router.put('/:id/collected', async (req, res, next) => {
  try {
    const { saleId } = req.body;
    const update = {
      status: 'collected',
      collectedBy: req.user._id,
      collectedAt: new Date(),
    };
    if (saleId) update.linkedSaleId = saleId;

    const order = await CollectionOrder.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      update,
      { new: true }
    );
    if (!order) return next(AppError.notFound('CollectionOrder'));

    if (req.io) {
      req.io.to(`store:${req.storeId}`).emit('collection:collected', { order });
    }

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
});

// PUT /:id/cancel — cancel order
router.put('/:id/cancel', async (req, res, next) => {
  try {
    const order = await CollectionOrder.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      { status: 'cancelled' },
      { new: true }
    );
    if (!order) return next(AppError.notFound('CollectionOrder'));

    if (req.io) {
      req.io.to(`store:${req.storeId}`).emit('collection:cancelled', { order });
    }

    res.json({ success: true, order });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
