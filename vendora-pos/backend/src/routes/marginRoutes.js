'use strict';

const express = require('express');
const router  = express.Router();
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');
const MarginSettings = require('../models/MarginSettings');
const Product = require('../models/Product');
const { UK_DEFAULTS, getOrCreate, getRule, getRuleForProduct, calcBreakdown, marginStatus } = require('../services/marginService');

const r2 = (n) => Math.round((n || 0) * 100) / 100;

// ── GET /api/margins ──────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const settings = await getOrCreate(req.storeId);
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/margins ──────────────────────────────────────────────────────────
router.put('/', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { defaultMargin, categories, alertBelowMinMargin, autoSuggestPrice, showMarginOnPOS } = req.body;

    const settings = await MarginSettings.findOneAndUpdate(
      { store: req.storeId },
      {
        $set: {
          ...(defaultMargin          !== undefined && { defaultMargin }),
          ...(categories             !== undefined && { categories }),
          ...(alertBelowMinMargin    !== undefined && { alertBelowMinMargin }),
          ...(autoSuggestPrice       !== undefined && { autoSuggestPrice }),
          ...(showMarginOnPOS        !== undefined && { showMarginOnPOS }),
        },
      },
      { new: true, upsert: true, runValidators: true },
    );
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/margins/calculate ────────────────────────────────────────────────
router.get('/calculate', async (req, res, next) => {
  try {
    const { costPrice, category, vatRate } = req.query;
    if (!costPrice) throw new AppError('costPrice is required', 400);

    const cost = parseFloat(costPrice);
    if (isNaN(cost) || cost < 0) throw new AppError('costPrice must be a non-negative number', 400);

    const settings = await getOrCreate(req.storeId);
    const rule = getRule(settings, category || '');
    // Allow vatRate + per-product targetMargin overrides from query
    if (vatRate !== undefined) rule.vatRate = parseInt(vatRate) || 0;
    if (req.query.targetMargin !== undefined && req.query.targetMargin !== '') {
      const tm = Number(req.query.targetMargin);
      if (!Number.isNaN(tm)) { rule.targetMargin = tm; rule.minMargin = Math.min(rule.minMargin ?? 0, tm); rule.source = 'product'; }
    }

    const breakdown = calcBreakdown(cost, rule);
    res.json({ success: true, ...breakdown, rule });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/margins/bulk-calculate ─────────────────────────────────────────
router.post('/bulk-calculate', async (req, res, next) => {
  try {
    const { items } = req.body; // [{ costPrice, category, vatRate, currentRetailPrice? }]
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('items array is required', 400);
    }

    const settings = await getOrCreate(req.storeId);

    const results = items.map(({ costPrice, category, vatRate, currentRetailPrice }) => {
      const cost = parseFloat(costPrice) || 0;
      const rule = getRule(settings, category || '');
      if (vatRate !== undefined) rule.vatRate = parseInt(vatRate) || 0;
      const breakdown = calcBreakdown(cost, rule);

      let status = 'green';
      if (currentRetailPrice != null) {
        const retail = parseFloat(currentRetailPrice);
        const excVat = retail / (1 + rule.vatRate / 100);
        const actual = excVat > 0 ? (excVat - cost) / excVat * 100 : 0;
        if (actual < rule.minMargin)          status = 'red';
        else if (actual < rule.minMargin * 1.2) status = 'amber';
      }

      return { ...breakdown, rule, status };
    });

    res.json({ success: true, results });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/margins/products ─────────────────────────────────────────────────
// List products with their EFFECTIVE margin rule (product override → category →
// default), current actual margin, status, and a suggested price. Powers the
// per-product margins table.
router.get('/products', async (req, res, next) => {
  try {
    const { search = '', limit = 50, onlyOverrides } = req.query;
    const q = { store: req.storeId, isActive: true };
    if (search) {
      q.$or = [
        { name: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
      ];
    }
    if (onlyOverrides === 'true') q['pricing.targetMargin'] = { $ne: null };

    const settings = await getOrCreate(req.storeId);
    const products = await Product.find(q)
      .select('name barcode category pricing')
      .limit(Math.min(parseInt(limit, 10) || 50, 200))
      .sort({ name: 1 })
      .lean();

    const rows = products.map((p) => {
      const rule = getRuleForProduct(settings, p);
      const cost = p.pricing?.costPrice || 0;
      const retailInc = p.pricing?.retailPrice || 0;
      const vat = (rule.vatRate || 0) / 100;
      const includesVat = p.pricing?.priceIncludesVat !== false;
      const retailIncVat = includesVat ? retailInc : r2(retailInc * (1 + vat));
      const excVat = retailIncVat / (1 + vat);
      const actualMargin = excVat > 0 ? r2(((excVat - cost) / excVat) * 100) : 0;
      const suggestedRetail = calcBreakdown(cost, rule).suggestedRetailIncVat;
      const status = (cost > 0 && retailInc > 0) ? marginStatus(retailIncVat, cost, rule) : 'green';

      return {
        id: String(p._id),
        name: p.name,
        barcode: p.barcode,
        category: p.category,
        cost: r2(cost),
        retail: r2(retailInc),
        effectiveTarget: rule.targetMargin,
        source: rule.source,               // 'product' | 'category' | 'default'
        override: p.pricing?.targetMargin ?? null,
        actualMargin,
        suggestedRetail,
        status,
      };
    });

    res.json({ success: true, products: rows, defaultMargin: settings.defaultMargin });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/margins/products/:id ─────────────────────────────────────────────
// Set or clear a product's per-product target margin. Optionally reprice it to
// the suggested retail in one go.
router.put('/products/:id', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { targetMargin, applySuggestedPrice } = req.body;
    const product = await Product.findOne({ _id: req.params.id, store: req.storeId });
    if (!product) throw new AppError('Product not found', 404);

    if (targetMargin === null || targetMargin === '' || targetMargin === undefined) {
      product.pricing.targetMargin = null; // clear → inherit category/default
    } else {
      const tm = Number(targetMargin);
      if (Number.isNaN(tm) || tm < 0 || tm > 100) throw new AppError('targetMargin must be 0–100', 400);
      product.pricing.targetMargin = tm;
    }

    let suggestedRetail = null;
    if (applySuggestedPrice) {
      const settings = await getOrCreate(req.storeId);
      const rule = getRuleForProduct(settings, product);
      suggestedRetail = calcBreakdown(product.pricing.costPrice || 0, rule).suggestedRetailIncVat;
      product.pricing.retailPrice = suggestedRetail;
    }

    await product.save();
    res.json({
      success: true,
      id: String(product._id),
      targetMargin: product.pricing.targetMargin,
      retailPrice: product.pricing.retailPrice,
      suggestedRetail,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/margins/reset-defaults ─────────────────────────────────────────
router.post('/reset-defaults', requireRole('supervisor'), async (req, res, next) => {
  try {
    const settings = await MarginSettings.findOneAndUpdate(
      { store: req.storeId },
      { $set: { categories: UK_DEFAULTS, defaultMargin: 30 } },
      { new: true, upsert: true },
    );
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
