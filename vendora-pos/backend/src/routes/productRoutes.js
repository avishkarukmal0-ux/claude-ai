'use strict';

const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const ExpiryMarkdownRule = require('../models/ExpiryMarkdownRule');
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');
const { todayStart } = require('../utils/helpers');

const msPerDay = 1000 * 60 * 60 * 24;

function computeExpiryStatus(product, rules) {
  if (!product.expiryBatches || product.expiryBatches.length === 0) {
    return { hasExpiryBatch: false };
  }
  // FIFO: find oldest non-depleted batch
  const active = product.expiryBatches
    .filter(b => b.quantity > 0)
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

  if (active.length === 0) return { hasExpiryBatch: false };

  const batch = active[0];
  const daysLeft = Math.floor((new Date(batch.expiryDate) - new Date()) / msPerDay);
  let status = 'ok';
  if (daysLeft < 0) status = 'expired';
  else if (daysLeft <= 3) status = 'expiring_soon';

  const retailPrice = product.pricing?.retailPrice || 0;
  let autoDiscountApplied = false;
  let discountedPrice = retailPrice;
  let discountPercent = 0;

  if (rules && rules.length && status !== 'ok') {
    const applicable = rules
      .filter(r => r.active && daysLeft <= r.daysBeforeExpiry)
      .sort((a, b) => a.daysBeforeExpiry - b.daysBeforeExpiry);
    if (applicable.length) {
      const rule = applicable[0];
      if (rule.discountType === 'percentage') {
        discountPercent = rule.discountAmount;
        discountedPrice = Math.round(retailPrice * (1 - rule.discountAmount / 100) * 100) / 100;
      } else {
        discountedPrice = Math.max(0, Math.round((retailPrice - rule.discountAmount) * 100) / 100);
        discountPercent = Math.round(((retailPrice - discountedPrice) / retailPrice) * 100);
      }
      autoDiscountApplied = true;
    }
  }

  return {
    hasExpiryBatch: true,
    nearestExpiry: batch.expiryDate,
    daysLeft,
    status,
    autoDiscountApplied,
    originalPrice: retailPrice,
    discountedPrice,
    discountPercent,
    batchId: batch.batchId,
  };
}

// GET /api/products/barcode/:code  — PRIMARY POS endpoint
router.get('/barcode/:code', async (req, res, next) => {
  try {
    const product = await Product.findOne({
      store: req.storeId,
      barcode: req.params.code,
      isActive: true,
    }).lean();
    if (!product) return next(AppError.barcodeNotFound(req.params.code));

    // Enrich with expiry status using FIFO + markdown rules
    let expiryStatus = { hasExpiryBatch: false };
    try {
      const rules = await ExpiryMarkdownRule.find({ store: req.storeId, active: true }).lean();
      expiryStatus = computeExpiryStatus(product, rules);
    } catch (_) { /* non-fatal */ }

    res.json({ success: true, product, expiryStatus });
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

// POST /api/products/suggest-price — authenticated
router.post('/suggest-price', async (req, res, next) => {
  try {
    const Sale = require('../models/Sale');
    const { costPrice, category, supplierId } = req.body;

    if (costPrice === undefined || costPrice === null) {
      return next(AppError.validationError('costPrice is required'));
    }
    if (!category) {
      return next(AppError.validationError('category is required'));
    }

    const cost = Number(costPrice);
    if (isNaN(cost) || cost < 0) {
      return next(AppError.validationError('costPrice must be a non-negative number'));
    }

    const MARGINS = {
      'Beer & Cider':    { min: 0.25, target: 0.30, max: 0.35 },
      'Beer':            { min: 0.25, target: 0.30, max: 0.35 },
      'Cider':           { min: 0.25, target: 0.30, max: 0.35 },
      'Spirits':         { min: 0.25, target: 0.30, max: 0.35 },
      'Wine':            { min: 0.25, target: 0.30, max: 0.35 },
      'Tobacco':         { min: 0.08, target: 0.10, max: 0.12 },
      'Soft Drinks':     { min: 0.35, target: 0.40, max: 0.45 },
      'Snacks':          { min: 0.40, target: 0.45, max: 0.50 },
      'Confectionery':   { min: 0.35, target: 0.40, max: 0.45 },
      'Mobile Top-Up':   { min: 0.00, target: 0.00, max: 0.02 },
      'Top-Up':          { min: 0.00, target: 0.00, max: 0.02 },
      'Lottery':         { min: 0.00, target: 0.00, max: 0.01 },
      default:           { min: 0.25, target: 0.30, max: 0.35 },
    };

    const marginRule = MARGINS[category] || MARGINS['default'];
    let { min: minMargin, target: targetMargin, max: maxMargin } = marginRule;

    // Try to get historical avg margin from sales for this category
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      const [historicalData] = await Sale.aggregate([
        {
          $match: {
            store: req.storeId,
            status: 'completed',
            isTraining: { $ne: true },
            createdAt: { $gte: thirtyDaysAgo },
          },
        },
        { $unwind: '$items' },
        {
          $match: {
            'items.unitPrice': { $gt: 0 },
            'items.costPrice': { $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            avgMargin: {
              $avg: {
                $divide: [
                  { $subtract: ['$items.unitPrice', '$items.costPrice'] },
                  '$items.unitPrice',
                ],
              },
            },
          },
        },
      ]);

      if (historicalData && historicalData.avgMargin > 0) {
        // Blend with category target (60% rule-based, 40% historical)
        targetMargin = targetMargin * 0.6 + historicalData.avgMargin * 0.4;
        // Keep within min/max bounds
        targetMargin = Math.min(Math.max(targetMargin, minMargin), maxMargin > 0 ? maxMargin : targetMargin);
      }
    } catch (_) {
      // Historical lookup failed — use category defaults
    }

    // Round to nearest £0.05: Math.ceil(cost / (1 - target) * 20) / 20
    let suggestedPrice;
    if (targetMargin >= 1) {
      suggestedPrice = cost;
    } else {
      suggestedPrice = Math.ceil((cost / (1 - targetMargin)) * 20) / 20;
    }

    const margin = suggestedPrice > 0 ? (suggestedPrice - cost) / suggestedPrice : 0;
    const marginPercent = Math.round(margin * 100);

    // Price range
    const calcPrice = (m) => {
      if (m >= 1) return cost;
      return Math.ceil((cost / (1 - m)) * 20) / 20;
    };
    const priceRangeMin = calcPrice(minMargin);
    const priceRangeMax = maxMargin > 0 ? calcPrice(maxMargin) : suggestedPrice;

    let marginRating;
    if (margin > 0.30) {
      marginRating = 'good';
    } else if (margin > 0.15) {
      marginRating = 'amber';
    } else {
      marginRating = 'poor';
    }

    res.json({
      success: true,
      suggestedPrice,
      margin: Math.round(margin * 10000) / 10000,
      marginPercent,
      reasoning: `Based on ${category} category (target ${Math.round(targetMargin * 100)}% margin)`,
      priceRange: {
        min: priceRangeMin,
        max: priceRangeMax,
      },
      marginRating,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
