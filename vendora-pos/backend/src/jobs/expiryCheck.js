'use strict';
const Product = require('../models/Product');
const logger = require('../utils/logger');
const expiryCheck = async (io) => {
  try {
    const in7days = new Date(); in7days.setDate(in7days.getDate() + 7);
    const products = await Product.find({ isActive: true, 'expiryTracking.enabled': true, 'expiryTracking.dates.date': { $lte: in7days } });
    if (io) {
      const byStore = {};
      for (const p of products) { const key = p.store.toString(); if (!byStore[key]) byStore[key] = []; byStore[key].push({ productId: p._id, name: p.name, quantity: p.stock.quantity, threshold: p.stock.lowStockThreshold }); }
      for (const [storeId, items] of Object.entries(byStore)) { io.to(`store:${storeId}`).emit('stock:expiring', { items }); }
    }
    logger.info(`Expiry check: found ${products.length} products expiring within 7 days`);
  } catch (err) { logger.error('Expiry check error:', err.message); }
};
module.exports = { expiryCheck };
