'use strict';

const express = require('express');
const router  = express.Router();
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');
const MarginSettings = require('../models/MarginSettings');
const { UK_DEFAULTS, getOrCreate, getRule, calcBreakdown } = require('../services/marginService');

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
    // Allow vatRate override from query
    if (vatRate !== undefined) rule.vatRate = parseInt(vatRate) || 0;

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
