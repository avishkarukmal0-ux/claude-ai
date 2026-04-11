'use strict';
const express = require('express');
const router = express.Router();
const StockTake = require('../models/StockTake');
const StockTakeItem = require('../models/StockTakeItem');
const Product = require('../models/Product');
const { requireRole } = require('../middleware/permissions');
const AppError = require('../utils/AppError');

// Helper: generate reference like ST-20260411-143022
function generateRef() {
  const now = new Date();
  const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  const t = now.toTimeString().slice(0, 8).replace(/:/g, '');
  return `ST-${d}-${t}`;
}

// GET /stock-take — list all stock takes for this store (newest first)
router.get('/', async (req, res, next) => {
  try {
    const stockTakes = await StockTake.find({ store: req.storeId })
      .sort({ createdAt: -1 })
      .lean();

    // Attach item count for each stock take
    const ids = stockTakes.map(s => s._id);
    const counts = await StockTakeItem.aggregate([
      { $match: { stockTake: { $in: ids } } },
      { $group: { _id: '$stockTake', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map(c => [c._id.toString(), c.count]));

    const formatted = stockTakes.map(s => ({
      ...s,
      itemCount: countMap[s._id.toString()] || 0,
      totalVarianceValue: s.summary?.totalVarianceValue ?? null,
    }));

    res.json({ success: true, stockTakes: formatted });
  } catch (err) { next(err); }
});

// POST /stock-take/create — start a new stock take session
router.post('/create', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { name, type = 'full', categories = [], notes } = req.body;
    const stockTake = await StockTake.create({
      store: req.storeId,
      reference: generateRef(),
      name: name || undefined,
      type,
      categories,
      notes,
      status: 'in_progress',
      startedAt: new Date(),
      createdBy: req.user._id,
      createdByName: req.user.displayName,
    });
    res.status(201).json({ success: true, stockTake });
  } catch (err) { next(err); }
});

// GET /stock-take/:id — get specific stock take with its items
router.get('/:id', async (req, res, next) => {
  try {
    const stockTake = await StockTake.findOne({ _id: req.params.id, store: req.storeId });
    if (!stockTake) return next(AppError.notFound('Stock take'));

    const items = await StockTakeItem.find({ stockTake: req.params.id })
      .populate('product', 'name barcode category costPrice')
      .sort({ createdAt: -1 });

    res.json({ success: true, stockTake, items });
  } catch (err) { next(err); }
});

// POST /stock-take/:id/count — record a product count
router.post('/:id/count', requireRole('cashier'), async (req, res, next) => {
  try {
    const stockTake = await StockTake.findOne({ _id: req.params.id, store: req.storeId });
    if (!stockTake) return next(AppError.notFound('Stock take'));
    if (!['in_progress', 'counting'].includes(stockTake.status)) {
      return next(AppError.validationError('Stock take is not open for counting'));
    }

    const { productId, barcode, counted, expiryDate, notes } = req.body;
    if (counted == null) return next(AppError.validationError('counted quantity is required'));

    // Resolve product by id or barcode
    let product = productId
      ? await Product.findOne({ _id: productId, store: req.storeId })
      : await Product.findOne({ 'barcode': barcode, store: req.storeId });
    if (!product) {
      product = await Product.findOne({ 'barcodes': barcode, store: req.storeId });
    }
    if (!product) return next(AppError.notFound('Product'));

    const systemQty = product.stock?.quantity ?? 0;
    const countedQty = Number(counted);
    const variance = countedQty - systemQty;
    const varianceValue = variance * (product.costPrice || 0);

    // Upsert: one item per product per stock take
    const item = await StockTakeItem.findOneAndUpdate(
      { stockTake: req.params.id, product: product._id },
      {
        store: req.storeId,
        barcode: barcode || product.barcode,
        productName: product.name,
        category: product.category,
        systemQuantity: systemQty,
        countedQuantity: countedQty,
        variance,
        varianceValue,
        unitCost: product.costPrice || 0,
        status: 'counted',
        countedBy: req.user._id,
        countedByName: req.user.displayName,
        countedAt: new Date(),
        notes: notes || undefined,
      },
      { upsert: true, new: true }
    );

    // Update stock take status to 'counting' if still 'in_progress'
    if (stockTake.status === 'in_progress') {
      stockTake.status = 'counting';
      await stockTake.save();
    }

    res.json({ success: true, item });
  } catch (err) { next(err); }
});

// POST /stock-take/:id/complete — finalise, apply variances to inventory
router.post('/:id/complete', requireRole('supervisor'), async (req, res, next) => {
  try {
    const stockTake = await StockTake.findOne({ _id: req.params.id, store: req.storeId });
    if (!stockTake) return next(AppError.notFound('Stock take'));
    if (stockTake.status === 'applied' || stockTake.status === 'cancelled') {
      return next(AppError.validationError(`Stock take is already ${stockTake.status}`));
    }

    const items = await StockTakeItem.find({ stockTake: req.params.id, status: 'counted' });
    if (items.length === 0) return next(AppError.validationError('No counted items to complete'));

    // Calculate summary stats
    let totalVarianceValue = 0;
    let positiveVariances = 0;
    let negativeVariances = 0;

    const bulkOps = [];
    for (const item of items) {
      totalVarianceValue += item.varianceValue || 0;
      if (item.variance > 0) positiveVariances++;
      if (item.variance < 0) negativeVariances++;

      // Adjust live inventory to the counted quantity
      bulkOps.push({
        updateOne: {
          filter: { _id: item.product, store: req.storeId },
          update: { $set: { 'stock.quantity': item.countedQuantity } },
        },
      });
    }

    if (bulkOps.length) await Product.bulkWrite(bulkOps);

    stockTake.status = 'applied';
    stockTake.completedAt = new Date();
    stockTake.appliedAt = new Date();
    stockTake.appliedBy = req.user._id;
    stockTake.summary = {
      totalProducts: items.length,
      countedProducts: items.length,
      variances: items.filter(i => i.variance !== 0).length,
      totalVarianceValue,
      positiveVariances,
      negativeVariances,
    };
    await stockTake.save();

    res.json({
      success: true,
      stockTake,
      report: {
        itemsProcessed: items.length,
        variances: items.filter(i => i.variance !== 0).length,
        totalVarianceValue,
        positiveVariances,
        negativeVariances,
      },
    });
  } catch (err) { next(err); }
});

// DELETE /stock-take/:id — cancel or delete a stock take
router.delete('/:id', requireRole('supervisor'), async (req, res, next) => {
  try {
    const stockTake = await StockTake.findOne({ _id: req.params.id, store: req.storeId });
    if (!stockTake) return next(AppError.notFound('Stock take'));
    if (stockTake.status === 'applied') {
      return next(AppError.validationError('Cannot delete an applied stock take'));
    }
    await StockTakeItem.deleteMany({ stockTake: req.params.id });
    await stockTake.deleteOne();
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
