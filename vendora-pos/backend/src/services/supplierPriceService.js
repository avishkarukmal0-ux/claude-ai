'use strict';
const PriceHistory = require('../models/PriceHistory');
const recordPrice = async (productId, barcode, supplierId, supplierName, price, source) => {
  const last = await PriceHistory.findOne({ product: productId }).sort({ recordedAt: -1 });
  const changePercent = last ? ((price - last.price) / last.price) * 100 : null;
  return PriceHistory.create({ product: productId, barcode, supplier: supplierId, supplierName, price, previousPrice: last ? last.price : null, changePercent, source, recordedAt: new Date() });
};
const getPriceHistory = async (productId, limit = 10) => PriceHistory.find({ product: productId }).sort({ recordedAt: -1 }).limit(limit);
module.exports = { recordPrice, getPriceHistory };
