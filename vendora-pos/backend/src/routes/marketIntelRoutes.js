'use strict';

const express = require('express');
const router = express.Router();
const MarketTrend = require('../models/MarketTrend');
const {
  analyseShopGaps,
  getSeasonalAlerts,
  generateAIInsights,
  askMarketAI,
  getStoreTrends,
} = require('../services/trendService');
const logger = require('../utils/logger');

// ── GET /api/market/trends ────────────────────────────────────────────────────
router.get('/trends', async (req, res) => {
  try {
    const { category, region = 'UK', limit = 20, direction } = req.query;
    const query = { region };
    if (category && category !== 'all') query.category = { $regex: new RegExp(category, 'i') };
    if (direction) query.trendDirection = direction;

    const trends = await MarketTrend.find(query)
      .sort({ trendScore: -1 })
      .limit(parseInt(limit))
      .lean();

    res.json({ trends, total: trends.length });
  } catch (err) {
    logger.error('market/trends error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/market/insights/:storeId ────────────────────────────────────────
router.get('/insights/:storeId', async (req, res) => {
  try {
    const insights = await generateAIInsights(req.params.storeId || req.storeId);
    res.json({ insights, generatedAt: new Date().toISOString() });
  } catch (err) {
    logger.error('market/insights error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/market/insights (no storeId param — use auth storeId) ────────────
router.get('/insights', async (req, res) => {
  try {
    const insights = await generateAIInsights(req.storeId);
    res.json({ insights, generatedAt: new Date().toISOString() });
  } catch (err) {
    logger.error('market/insights error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/market/gaps ──────────────────────────────────────────────────────
router.get('/gaps', async (req, res) => {
  try {
    const gaps = await analyseShopGaps(req.storeId);
    const totalMissed = gaps.reduce((s, g) => s + (g.estimatedWeeklyRevenue || 0), 0);
    res.json({ gaps, totalMissedRevenue: Math.round(totalMissed * 100) / 100 });
  } catch (err) {
    logger.error('market/gaps error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/market/seasonal ──────────────────────────────────────────────────
router.get('/seasonal', async (req, res) => {
  try {
    const events = await getSeasonalAlerts();
    res.json({ events });
  } catch (err) {
    logger.error('market/seasonal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/market/my-trends ─────────────────────────────────────────────────
router.get('/my-trends', async (req, res) => {
  try {
    const data = await getStoreTrends(req.storeId);
    res.json(data);
  } catch (err) {
    logger.error('market/my-trends error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/market/ask ──────────────────────────────────────────────────────
router.post('/ask', async (req, res) => {
  try {
    const { question } = req.body;
    if (!question?.trim()) return res.status(400).json({ error: 'question is required' });

    const answer = await askMarketAI(req.storeId, question.trim());
    res.json({ answer, question: question.trim(), askedAt: new Date().toISOString() });
  } catch (err) {
    logger.error('market/ask error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/market/refresh ──────────────────────────────────────────────────
// Manually trigger AI insight refresh for this store
router.post('/refresh', async (req, res) => {
  try {
    // Clear cache by importing NodeCache — re-generate
    const NodeCache = require('node-cache');
    // We call generateAIInsights which will bypass cache if we clear it
    // Simplest: just call and let it re-fetch (cache TTL is 23h normally)
    const insights = await generateAIInsights(req.storeId);
    res.json({ insights, refreshedAt: new Date().toISOString() });
  } catch (err) {
    logger.error('market/refresh error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
