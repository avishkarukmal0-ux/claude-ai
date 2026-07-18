'use strict';

const MarketTrend = require('../models/MarketTrend');
const Store = require('../models/Store');
const { fetchGoogleTrends, generateAIInsights, TRACKED_KEYWORDS } = require('../services/trendService');
const logger = require('../utils/logger');

async function trendUpdateJob(io) {
  logger.info('trendUpdateJob: starting trend refresh');

  try {
    // 1. Fetch latest Google Trends data
    const trendResults = await fetchGoogleTrends(TRACKED_KEYWORDS);
    logger.info(`trendUpdateJob: fetched ${trendResults.length} trend results`);

    // 2. Update MarketTrend records with fresh scores
    for (const result of trendResults) {
      const existing = await MarketTrend.findOne({ productName: { $regex: new RegExp(result.keyword, 'i') } });
      if (existing) {
        const prevScore = existing.trendScore;
        existing.trendScore = result.score;
        existing.searchVolume = result.trend;
        existing.searchVolumeChange = result.change;
        existing.source = 'google_trends';
        existing.updatedAt = new Date();

        // Update direction based on change
        if (result.change > 100) existing.trendDirection = 'viral';
        else if (result.change > 20) existing.trendDirection = 'rising';
        else if (result.change < -20) existing.trendDirection = 'falling';
        else existing.trendDirection = 'stable';

        await existing.save();
        logger.info(`trendUpdateJob: updated ${existing.productName} score ${prevScore} → ${result.score}`);
      }
    }
  } catch (err) {
    logger.error('trendUpdateJob: Google Trends fetch failed:', err.message);
  }

  // 3. Refresh AI insights for all active stores
  try {
    const stores = await Store.find({}, '_id name').lean();
    for (const store of stores) {
      try {
        await generateAIInsights(store._id);

        if (io) {
          io.to(`store:${store._id}`).emit('trends:updated', {
            storeId: store._id,
            updatedAt: new Date().toISOString(),
          });
        }
        logger.info(`trendUpdateJob: refreshed insights for ${store.name}`);
      } catch (storeErr) {
        logger.error(`trendUpdateJob: failed for store ${store._id}:`, storeErr.message);
      }
    }
  } catch (err) {
    logger.error('trendUpdateJob: store refresh failed:', err.message);
  }

  logger.info('trendUpdateJob: complete');
}

module.exports = { trendUpdateJob };
