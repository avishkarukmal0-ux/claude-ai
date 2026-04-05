'use strict';

const Product = require('../models/Product');
const Sale = require('../models/Sale');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const { generatePONumber } = require('../utils/helpers');

const VELOCITY_DAYS = 30;

async function getSuggestions(storeId) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - VELOCITY_DAYS);

  const sales = await Sale.find({
    store: storeId,
    status: 'completed',
    completedAt: { $gte: cutoff },
  });

  // Build velocity map: productId -> units sold
  const velocityMap = {};
  for (const sale of sales) {
    for (const item of sale.items || []) {
      const key = item.product?.toString() || item.barcode;
      if (!key) continue;
      velocityMap[key] = (velocityMap[key] || 0) + item.quantity;
    }
  }

  const products = await Product.find({ store: storeId, isActive: true });
  const suggestions = [];

  for (const product of products) {
    const key = product._id.toString();
    const unitsSold = velocityMap[key] || 0;
    const dailyRate = unitsSold / VELOCITY_DAYS;
    const currentQty = product.stock.quantity || 0;
    const reorderPoint = product.stock.reorderPoint || product.stock.lowStockThreshold || 5;
    const daysUntilStockout = dailyRate > 0 ? currentQty / dailyRate : null;
    const suggestedQty = product.stock.reorderQuantity || Math.max(10, Math.ceil(dailyRate * 14));

    if (currentQty <= reorderPoint || (daysUntilStockout !== null && daysUntilStockout < 14)) {
      suggestions.push({
        productId: product._id,
        barcode: product.barcode,
        name: product.name,
        category: product.category,
        supplier: product.supplier,
        currentStock: currentQty,
        dailyVelocity: Math.round(dailyRate * 100) / 100,
        daysUntilStockout: daysUntilStockout !== null ? Math.round(daysUntilStockout * 10) / 10 : null,
        reorderPoint,
        suggestedQuantity: suggestedQty,
        costPrice: product.pricing.costPrice,
        estimatedCost: suggestedQty * product.pricing.costPrice,
        urgency: currentQty === 0 ? 'critical' : (daysUntilStockout !== null && daysUntilStockout < 3 ? 'high' : 'medium'),
      });
    }
  }

  return suggestions.sort((a, b) => {
    if (a.daysUntilStockout === null) return 1;
    if (b.daysUntilStockout === null) return -1;
    return a.daysUntilStockout - b.daysUntilStockout;
  });
}

async function getShoppingList(storeId, supplierId) {
  const suggestions = await getSuggestions(storeId);
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) return [];

  const supplierBarcodes = (supplier.products || []).map((p) => p.barcode || '');
  const supplierProducts = suggestions.filter(
    (s) => supplierBarcodes.includes(s.barcode) || s.supplier === supplier.name
  );

  return {
    supplier: supplier.name,
    supplierCode: supplier.code,
    items: supplierProducts,
    estimatedTotal: supplierProducts.reduce((sum, p) => sum + p.estimatedCost, 0),
  };
}

async function createPO(storeId, suggestions, staffId) {
  if (!suggestions || suggestions.length === 0) {
    throw new Error('No suggestions provided');
  }

  // Group by supplier — use first suggestion's supplier
  const supplierName = suggestions[0].supplier || 'Unknown';
  const supplier = await Supplier.findOne({ store: storeId, name: supplierName });

  const items = suggestions.map((s) => ({
    product: s.productId,
    barcode: s.barcode,
    name: s.name,
    quantity: s.suggestedQuantity,
    unitPrice: s.costPrice,
    lineTotal: s.suggestedQuantity * s.costPrice,
  }));

  const total = items.reduce((s, i) => s + i.lineTotal, 0);

  return PurchaseOrder.create({
    store: storeId,
    orderNumber: generatePONumber(),
    supplier: supplier ? supplier._id : undefined,
    supplierName,
    status: 'draft',
    items,
    totals: { subtotal: total, total },
    orderMethod: 'auto-reorder',
    sentBy: staffId,
  });
}

async function getAnalytics(storeId) {
  const suggestions = await getSuggestions(storeId);
  const critical = suggestions.filter((s) => s.urgency === 'critical');
  const high = suggestions.filter((s) => s.urgency === 'high');

  return {
    totalSuggestionsCount: suggestions.length,
    criticalCount: critical.length,
    highCount: high.length,
    estimatedReorderCost: suggestions.reduce((s, p) => s + p.estimatedCost, 0),
    suggestions: suggestions.slice(0, 20),
  };
}

module.exports = { getSuggestions, getShoppingList, createPO, getAnalytics };
