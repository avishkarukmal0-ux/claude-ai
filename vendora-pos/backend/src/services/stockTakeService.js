'use strict';

const StockTake = require('../models/StockTake');
const StockTakeItem = require('../models/StockTakeItem');
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const AppError = require('../utils/AppError');

async function create(storeId, staffId, staffName, type = 'full', categories = []) {
  const stockTake = await StockTake.create({
    store: storeId,
    type,
    categories,
    status: 'draft',
    createdBy: staffId,
    createdByName: staffName,
    reference: `ST-${Date.now()}`,
  });

  const productQuery = { store: storeId, isActive: true };
  if (type === 'category' && categories.length > 0) {
    productQuery.category = { $in: categories };
  }
  const products = await Product.find(productQuery);

  const items = products.map((p) => ({
    stockTake: stockTake._id,
    store: storeId,
    product: p._id,
    barcode: p.barcode,
    productName: p.name,
    category: p.category,
    systemQuantity: p.stock.quantity,
    unitCost: p.pricing.costPrice,
    status: 'pending',
  }));

  if (items.length > 0) {
    await StockTakeItem.insertMany(items);
  }

  stockTake.summary.totalProducts = items.length;
  await stockTake.save();

  return stockTake;
}

async function start(stockTakeId) {
  const st = await StockTake.findByIdAndUpdate(
    stockTakeId,
    { status: 'counting', startedAt: new Date() },
    { new: true }
  );
  if (!st) throw AppError.notFound('Stock take');
  return st;
}

async function recordCount(stockTakeId, barcode, countedQuantity, staffId, staffName) {
  const item = await StockTakeItem.findOne({ stockTake: stockTakeId, barcode });
  if (!item) throw AppError.notFound('Stock take item');

  item.countedQuantity = countedQuantity;
  item.variance = countedQuantity - item.systemQuantity;
  item.varianceValue = item.variance * (item.unitCost || 0);
  item.status = 'counted';
  item.countedBy = staffId;
  item.countedByName = staffName;
  item.countedAt = new Date();
  await item.save();

  // Update stocktake summary
  await _updateSummary(stockTakeId);

  return item;
}

async function batchCount(stockTakeId, counts, staffId, staffName) {
  const results = [];
  for (const { barcode, countedQuantity } of counts) {
    const result = await recordCount(stockTakeId, barcode, countedQuantity, staffId, staffName);
    results.push(result);
  }
  return results;
}

async function getVariances(stockTakeId) {
  return StockTakeItem.find({ stockTake: stockTakeId, variance: { $ne: 0, $exists: true } })
    .sort({ varianceValue: 1 });
}

async function getUnscanned(stockTakeId) {
  return StockTakeItem.find({ stockTake: stockTakeId, status: 'pending' });
}

async function apply(stockTakeId, staffId) {
  const st = await StockTake.findById(stockTakeId);
  if (!st) throw AppError.notFound('Stock take');

  const items = await StockTakeItem.find({ stockTake: stockTakeId, status: 'counted', variance: { $ne: 0 } });

  for (const item of items) {
    await Product.findByIdAndUpdate(item.product, {
      $set: { 'stock.quantity': item.countedQuantity },
    });

    await StockMovement.create({
      store: st.store,
      product: item.product,
      barcode: item.barcode,
      productName: item.productName,
      type: 'stocktake',
      quantity: item.variance,
      quantityBefore: item.systemQuantity,
      quantityAfter: item.countedQuantity,
      reference: st.reference,
      reason: 'Stock take adjustment',
      staff: staffId,
    });
  }

  st.status = 'applied';
  st.appliedAt = new Date();
  st.appliedBy = staffId;
  await st.save();
  return st;
}

async function complete(stockTakeId) {
  const st = await StockTake.findById(stockTakeId);
  if (!st) throw AppError.notFound('Stock take');

  await _updateSummary(stockTakeId);
  st.status = 'variance_review';
  st.completedAt = new Date();
  await st.save();
  return st;
}

async function _updateSummary(stockTakeId) {
  const items = await StockTakeItem.find({ stockTake: stockTakeId });
  const counted = items.filter((i) => i.status === 'counted');
  const variances = counted.filter((i) => i.variance !== 0 && i.variance != null);

  await StockTake.findByIdAndUpdate(stockTakeId, {
    'summary.countedProducts': counted.length,
    'summary.variances': variances.length,
    'summary.totalVarianceValue': variances.reduce((s, i) => s + (i.varianceValue || 0), 0),
    'summary.positiveVariances': variances.filter((i) => i.variance > 0).length,
    'summary.negativeVariances': variances.filter((i) => i.variance < 0).length,
  });
}

module.exports = { create, start, recordCount, batchCount, getVariances, getUnscanned, apply, complete };
