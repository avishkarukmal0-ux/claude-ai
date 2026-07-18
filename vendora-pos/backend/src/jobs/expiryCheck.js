'use strict';
const Product = require('../models/Product');
const ExpiryMarkdownRule = require('../models/ExpiryMarkdownRule');
const logger = require('../utils/logger');

/**
 * Compute expiry status for a batch.
 * expired = past today, expiring_soon = within 3 days, ok = more than 3 days away
 */
function batchStatus(expiryDate) {
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.floor((new Date(expiryDate) - now) / msPerDay);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 3) return 'expiring_soon';
  return 'ok';
}

/**
 * For a given product + batch + store rules, compute the discounted price.
 * Returns { discountedPrice, discountPercent, ruleApplied }
 */
function applyMarkdownRule(retailPrice, daysLeft, rules) {
  if (!rules || rules.length === 0) return null;

  // Sort rules: smallest daysBeforeExpiry first (most aggressive discount wins)
  const sorted = [...rules].sort((a, b) => a.daysBeforeExpiry - b.daysBeforeExpiry);

  // Find the tightest rule that applies (daysLeft <= rule.daysBeforeExpiry)
  const applicable = sorted.filter(r => r.active && daysLeft <= r.daysBeforeExpiry);
  if (applicable.length === 0) return null;

  const rule = applicable[0]; // tightest match
  let discountedPrice;
  let discountPercent;

  if (rule.discountType === 'percentage') {
    discountPercent = rule.discountAmount;
    discountedPrice = Math.round(retailPrice * (1 - rule.discountAmount / 100) * 100) / 100;
  } else {
    discountedPrice = Math.max(0, Math.round((retailPrice - rule.discountAmount) * 100) / 100);
    discountPercent = Math.round(((retailPrice - discountedPrice) / retailPrice) * 100);
  }

  return { discountedPrice, discountPercent, ruleApplied: rule };
}

const expiryCheck = async (io) => {
  try {
    logger.info('Running expiry check job...');
    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;

    // Load all products with expiry batches
    const products = await Product.find({
      isActive: true,
      'expiryBatches.0': { $exists: true },
    }).lean();

    if (products.length === 0) {
      logger.info('Expiry check: no products with expiry batches found');
      return;
    }

    // Group stores so we can load rules once per store
    const storeIds = [...new Set(products.map(p => p.store.toString()))];
    const rulesByStore = {};
    for (const storeId of storeIds) {
      rulesByStore[storeId] = await ExpiryMarkdownRule.find({ store: storeId, active: true }).lean();
    }

    const summary = { expired: [], expiringSoon: [], expiringThisWeek: [], updated: 0 };
    const alertsByStore = {};

    for (const product of products) {
      let productUpdated = false;
      const storeKey = product.store.toString();
      const rules = rulesByStore[storeKey] || [];
      const retailPrice = product.pricing?.retailPrice || 0;

      const updatedBatches = product.expiryBatches.map(batch => {
        if (batch.quantity <= 0) return batch;

        const daysLeft = Math.floor((new Date(batch.expiryDate) - now) / msPerDay);
        const newStatus = batchStatus(batch.expiryDate);

        if (newStatus !== batch.status) productUpdated = true;

        const markdown = applyMarkdownRule(retailPrice, daysLeft, rules);

        const enriched = { ...batch, status: newStatus, _daysLeft: daysLeft, _markdown: markdown };

        if (newStatus === 'expired') {
          summary.expired.push({ product, batch: enriched, daysOverdue: Math.abs(daysLeft) });
          if (!alertsByStore[storeKey]) alertsByStore[storeKey] = { expired: [], expiringSoon: [] };
          alertsByStore[storeKey].expired.push({ name: product.name, daysOverdue: Math.abs(daysLeft) });
        } else if (newStatus === 'expiring_soon') {
          summary.expiringSoon.push({ product, batch: enriched, daysLeft });
          if (!alertsByStore[storeKey]) alertsByStore[storeKey] = { expired: [], expiringSoon: [] };
          alertsByStore[storeKey].expiringSoon.push({ name: product.name, daysLeft });
          if (daysLeft <= 7) summary.expiringThisWeek.push({ product, batch: enriched, daysLeft });
        } else if (daysLeft <= 7) {
          summary.expiringThisWeek.push({ product, batch: enriched, daysLeft });
        }

        return { ...batch, status: newStatus };
      });

      if (productUpdated) {
        await Product.updateOne(
          { _id: product._id },
          { $set: { expiryBatches: updatedBatches } }
        );
        summary.updated++;
      }
    }

    // Emit socket alerts per store
    if (io) {
      for (const [storeId, alerts] of Object.entries(alertsByStore)) {
        io.to(`store:${storeId}`).emit('expiry:alert', {
          store: storeId,
          summary: {
            expiredCount: alerts.expired.length,
            expiringSoonCount: alerts.expiringSoon.length,
          },
          products: [...alerts.expired, ...alerts.expiringSoon],
        });
      }
    }

    logger.info(
      `Expiry check complete: ${summary.expired.length} expired, ` +
      `${summary.expiringSoon.length} expiring soon, ` +
      `${summary.expiringThisWeek.length} this week, ` +
      `${summary.updated} products updated`
    );

    return summary;
  } catch (err) {
    logger.error('Expiry check error:', err.message);
  }
};

module.exports = { expiryCheck };
