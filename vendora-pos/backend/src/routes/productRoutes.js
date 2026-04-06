'use strict';

const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');
const { todayStart } = require('../utils/helpers');

// GET /api/products/barcode/:code  — PRIMARY POS endpoint
router.get('/barcode/:code', async (req, res, next) => {
  try {
    const product = await Product.findOne({
      store: req.storeId,
      barcode: req.params.code,
      isActive: true,
    }).lean();
    if (!product) return next(AppError.barcodeNotFound(req.params.code));
    res.json({ success: true, product });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/categories
router.get('/categories', async (req, res, next) => {
  try {
    const categories = await Product.distinct('category', { store: req.storeId, isActive: true });
    res.json({ success: true, categories: categories.sort() });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/low-stock
router.get('/low-stock', async (req, res, next) => {
  try {
    const products = await Product.find({ store: req.storeId, isActive: true }).lean();
    const lowStock = products.filter((p) => p.stock.quantity <= p.stock.lowStockThreshold);
    res.json({ success: true, products: lowStock });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/expiring
router.get('/expiring', async (req, res, next) => {
  try {
    const in30days = new Date(); in30days.setDate(in30days.getDate() + 30);
    const products = await Product.find({
      store: req.storeId,
      isActive: true,
      'expiryTracking.enabled': true,
      'expiryTracking.dates.date': { $lte: in30days },
    }).lean();
    res.json({ success: true, products });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/export
router.get('/export', requireRole('manager'), async (req, res, next) => {
  try {
    const products = await Product.find({ store: req.storeId }).lean();
    const { stringify } = require('csv-stringify/sync');
    const rows = products.map((p) => ({
      barcode: p.barcode,
      sku: p.sku || '',
      name: p.name,
      category: p.category,
      retailPrice: p.pricing.retailPrice,
      costPrice: p.pricing.costPrice,
      vatRate: p.pricing.vatRate,
      quantity: p.stock.quantity,
      lowStockThreshold: p.stock.lowStockThreshold,
      ageRestricted: p.attributes.ageRestricted ? 'Y' : 'N',
      isActive: p.isActive ? 'Y' : 'N',
    }));
    const csv = stringify(rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// GET /api/products
router.get('/', async (req, res, next) => {
  try {
    const { category, search, active, stockStatus, page = 1, limit = 100 } = req.query;
    const query = { store: req.storeId };

    if (active !== undefined) query.isActive = active === 'true';
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { barcode: new RegExp(search, 'i') },
        { brand: new RegExp(search, 'i') },
      ];
    }

    let dbQuery = Product.find(query).sort({ name: 1 }).skip((page - 1) * parseInt(limit)).limit(parseInt(limit));
    const [products, total] = await Promise.all([dbQuery.lean(), Product.countDocuments(query)]);

    let filtered = products;
    if (stockStatus === 'low') filtered = products.filter((p) => p.stock.quantity <= p.stock.lowStockThreshold);
    if (stockStatus === 'out') filtered = products.filter((p) => p.stock.quantity <= 0);

    res.json({ success: true, products: filtered, total });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, store: req.storeId });
    if (!product) return next(AppError.notFound('Product'));
    res.json({ success: true, product });
  } catch (err) {
    next(err);
  }
});

// POST /api/products
router.post('/', requireRole('manager'), async (req, res, next) => {
  try {
    const existing = await Product.findOne({ store: req.storeId, barcode: req.body.barcode });
    if (existing) return next(new AppError('Barcode already exists', 409, 'DUPLICATE_KEY'));

    const product = await Product.create({ store: req.storeId, ...req.body });
    res.status(201).json({ success: true, product });
  } catch (err) {
    next(err);
  }
});

// PUT /api/products/:id
router.put('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      req.body,
      { new: true, runValidators: true }
    );
    if (!product) return next(AppError.notFound('Product'));
    res.json({ success: true, product });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id
router.delete('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const product = await Product.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      { isActive: false },
      { new: true }
    );
    if (!product) return next(AppError.notFound('Product'));
    res.json({ success: true, message: 'Product deactivated' });
  } catch (err) {
    next(err);
  }
});

// POST /api/products/:id/adjust-stock
router.post('/:id/adjust-stock', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { adjustment, reason } = req.body;
    const product = await Product.findOne({ _id: req.params.id, store: req.storeId });
    if (!product) return next(AppError.notFound('Product'));

    const quantityBefore = product.stock.quantity;
    product.stock.quantity += adjustment;
    await product.save();

    await StockMovement.create({
      store: req.storeId,
      product: product._id,
      barcode: product.barcode,
      productName: product.name,
      type: 'adjustment',
      quantity: adjustment,
      quantityBefore,
      quantityAfter: product.stock.quantity,
      reason,
      staff: req.user._id,
      staffName: req.user.displayName,
    });

    res.json({ success: true, product });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id/insights (#74) — sales velocity, margin, stock history
router.get('/:id/insights', async (req, res, next) => {
  try {
    const Sale = require('../models/Sale');
    const product = await Product.findOne({ _id: req.params.id, store: req.storeId }).lean();
    if (!product) return next(AppError.notFound('Product'));

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

    // Sales velocity: units sold in last 7 and 30 days
    const [sold30, sold7, movements] = await Promise.all([
      Sale.aggregate([
        { $match: { store: req.storeId, createdAt: { $gte: thirtyDaysAgo }, isVoid: { $ne: true } } },
        { $unwind: '$items' },
        { $match: { $or: [{ 'items.productId': product._id }, { 'items.barcode': product.barcode }] } },
        { $group: { _id: null, qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.lineTotal' } } },
      ]),
      Sale.aggregate([
        { $match: { store: req.storeId, createdAt: { $gte: sevenDaysAgo }, isVoid: { $ne: true } } },
        { $unwind: '$items' },
        { $match: { $or: [{ 'items.productId': product._id }, { 'items.barcode': product.barcode }] } },
        { $group: { _id: null, qty: { $sum: '$items.quantity' } } },
      ]),
      StockMovement.find({ store: req.storeId, product: product._id }).sort({ createdAt: -1 }).limit(20).lean(),
    ]);

    const unitsSold30 = sold30[0]?.qty || 0;
    const revenue30 = sold30[0]?.revenue || 0;
    const unitsSold7 = sold7[0]?.qty || 0;
    const costPrice = product.pricing?.costPrice || 0;
    const retailPrice = product.pricing?.retailPrice || 0;
    const margin = costPrice > 0 ? ((retailPrice - costPrice) / retailPrice * 100).toFixed(1) : null;
    const dailyVelocity = unitsSold30 > 0 ? (unitsSold30 / 30).toFixed(2) : 0;
    const daysOfStock = dailyVelocity > 0 ? Math.round(product.stock?.quantity / dailyVelocity) : null;

    res.json({
      success: true,
      product,
      insights: {
        unitsSold7,
        unitsSold30,
        revenue30,
        dailyVelocity: Number(dailyVelocity),
        daysOfStock,
        marginPct: margin ? Number(margin) : null,
        costPrice,
        retailPrice,
        currentStock: product.stock?.quantity || 0,
        lowStockThreshold: product.stock?.lowStockThreshold || 5,
      },
      stockHistory: movements,
    });
  } catch (err) { next(err); }
});

// POST /api/products/import
router.post('/import', requireRole('manager'), async (req, res, next) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products)) return next(AppError.validation('products array required'));

    const results = { created: 0, updated: 0, errors: [] };
    for (const p of products) {
      try {
        await Product.findOneAndUpdate(
          { store: req.storeId, barcode: p.barcode },
          { store: req.storeId, ...p },
          { upsert: true, new: true, runValidators: true }
        );
        results.created++;
      } catch (err) {
        results.errors.push({ barcode: p.barcode, error: err.message });
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
