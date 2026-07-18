'use strict';
const { distance } = require('fastest-levenshtein');
const Product = require('../models/Product');
const PriceHistory = require('../models/PriceHistory');

// ── Fuzzy name matching ───────────────────────────────────────────────────────

/**
 * Normalise a product name for fuzzy matching:
 * lowercase, remove punctuation, collapse spaces
 */
function normalise(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Similarity score (0–1) between two strings using Levenshtein distance.
 */
function similarity(a, b) {
  const na = normalise(a);
  const nb = normalise(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - distance(na, nb) / maxLen;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Try to match by exact barcode.
 * Returns Product document or null.
 */
async function matchByBarcode(barcode, storeId) {
  if (!barcode) return null;
  const clean = String(barcode).replace(/\s/g, '');
  if (!clean) return null;
  return Product.findOne({ store: storeId, barcode: clean, isActive: true }).lean();
}

/**
 * Fuzzy match by product name.
 * Returns { product, confidence } or null (if best match < 0.75).
 */
async function matchByName(name, storeId) {
  if (!name) return null;
  const products = await Product.find({ store: storeId, isActive: true }, 'name barcode pricing').lean();
  let best = null;
  let bestScore = 0;
  for (const p of products) {
    const score = similarity(name, p.name);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  if (bestScore < 0.75) return null;
  return { product: best, confidence: bestScore };
}

/**
 * Detect whether the cost price has changed.
 * Returns { changed, previousCost, newCost, changePercent, direction }
 */
function detectPriceChange(product, newCost) {
  const previousCost = product?.pricing?.costPrice ?? null;
  if (previousCost === null || previousCost === undefined) {
    return { changed: false, previousCost: null, newCost, changePercent: 0, direction: 'none' };
  }
  const delta = newCost - previousCost;
  if (Math.abs(delta) < 0.001) {
    return { changed: false, previousCost, newCost, changePercent: 0, direction: 'none' };
  }
  const changePercent = previousCost > 0
    ? Math.round((delta / previousCost) * 10000) / 100
    : 0;
  return {
    changed: true,
    previousCost,
    newCost,
    changePercent,
    direction: delta > 0 ? 'up' : 'down',
  };
}

/**
 * Compute the gross margin percentage if retail price stays the same
 * but cost changes.
 */
function marginAfterChange(product, newCost) {
  const retail = product?.pricing?.retailPrice;
  if (!retail || retail <= 0) return null;
  return Math.round(((retail - newCost) / retail) * 10000) / 100;
}

/**
 * Log a price change to PriceHistory.
 */
async function logPriceHistory(product, newCost, supplierInfo) {
  const previousCost = product?.pricing?.costPrice ?? 0;
  const changePercent = previousCost > 0
    ? Math.round(((newCost - previousCost) / previousCost) * 10000) / 100
    : 0;
  await PriceHistory.create({
    product: product._id,
    barcode: product.barcode,
    supplier: supplierInfo?.supplierId,
    supplierName: supplierInfo?.supplierName,
    price: newCost,
    previousPrice: previousCost,
    changePercent,
    source: 'invoice',
  });
}

/**
 * Full match pipeline for a single invoice line item.
 * Returns enriched item object with matchedProduct, confidence, price change, etc.
 */
async function matchItem(rawItem, storeId) {
  const { barcode, productName, quantity, unitCost } = rawItem;
  let matchedProduct = null;
  let matchConfidence = 0;
  let matchMethod = 'none';

  // 1. Try barcode first
  if (barcode) {
    const found = await matchByBarcode(barcode, storeId);
    if (found) {
      matchedProduct = found;
      matchConfidence = 1.0;
      matchMethod = 'barcode';
    }
  }

  // 2. Fall back to name fuzzy match
  if (!matchedProduct && productName) {
    const result = await matchByName(productName, storeId);
    if (result) {
      matchedProduct = result.product;
      matchConfidence = result.confidence;
      matchMethod = 'name';
    }
  }

  const isNewProduct = !matchedProduct;
  let priceChanged = false;
  let changePercent = 0;
  let changeDirection = 'none';
  let previousCost = null;
  let marginPct = null;
  let marginWarning = false;

  if (matchedProduct && unitCost > 0) {
    const priceInfo = detectPriceChange(matchedProduct, unitCost);
    priceChanged = priceInfo.changed;
    changePercent = priceInfo.changePercent;
    changeDirection = priceInfo.direction;
    previousCost = priceInfo.previousCost;
    marginPct = marginAfterChange(matchedProduct, unitCost);
    // Warn if margin drops below 10%
    if (marginPct !== null && marginPct < 10) marginWarning = true;
  }

  return {
    rawText: rawItem.rawText || productName,
    barcode: barcode || matchedProduct?.barcode || '',
    productName: matchedProduct?.name || productName || '',
    quantity: quantity || 1,
    unitCost: unitCost || 0,
    totalCost: (unitCost || 0) * (quantity || 1),
    matchedProduct: matchedProduct?._id || null,
    matchConfidence,
    matchMethod,
    previousCost,
    priceChanged,
    changePercent,
    changeDirection,
    isNewProduct,
    applyUpdate: !isNewProduct && priceChanged,
    marginAfter: marginPct,
    marginWarning,
  };
}

module.exports = {
  matchByBarcode,
  matchByName,
  detectPriceChange,
  logPriceHistory,
  matchItem,
};
