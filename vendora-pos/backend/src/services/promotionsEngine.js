'use strict';

const Promotion = require('../models/Promotion');
const ActivePromotion = require('../models/ActivePromotion');
const AppError = require('../utils/AppError');

/**
 * Rebuild the ActivePromotion cache for a store from the Promotion collection.
 */
async function syncActivePromotions(storeId) {
  const now = new Date();
  const activePromos = await Promotion.find({
    store: storeId,
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  await ActivePromotion.deleteMany({ store: storeId });

  if (activePromos.length > 0) {
    await ActivePromotion.insertMany(
      activePromos.map((p) => ({
        store: storeId,
        promotion: p._id,
        name: p.name,
        type: p.type,
        applicableTo: p.applicableTo,
        params: p.params,
        autoApply: p.autoApply,
        priority: p.priority,
        stackable: p.stackable,
        expiresAt: p.endDate,
      }))
    );
  }

  return activePromos.length;
}

/**
 * Validate a promo code and return the promotion if valid.
 */
async function validatePromoCode(code, storeId) {
  const now = new Date();
  const promo = await Promotion.findOne({
    store: storeId,
    code: code.toUpperCase(),
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  });

  if (!promo) throw AppError.promoCodeInvalid();

  if (promo.limits.maxUsesTotal && promo.limits.currentUsesTotal >= promo.limits.maxUsesTotal) {
    throw AppError.promoLimitReached();
  }

  return promo;
}

/**
 * Check if an item qualifies for a promotion based on applicableTo rules.
 */
function itemQualifies(item, promo) {
  const { applicableTo } = promo;
  if (!applicableTo || applicableTo.type === 'all') return true;

  if (applicableTo.type === 'categories') {
    return applicableTo.categories.includes(item.category);
  }

  if (applicableTo.type === 'products') {
    return (
      applicableTo.barcodes.includes(item.barcode) ||
      (item.productId && applicableTo.products.some(
        (p) => p.toString() === item.productId.toString()
      ))
    );
  }

  return false;
}

/**
 * Apply all eligible promotions to a cart.
 * items: [{ productId, barcode, name, quantity, unitPrice, category, lineTotal }]
 * Returns { items, promotionsApplied, totalDiscount }
 */
async function applyPromotions(items, customer, promoCode, storeId) {
  const now = new Date();

  // Load auto-apply promotions
  const autoPromos = await ActivePromotion.find({ store: storeId, autoApply: true })
    .populate('promotion')
    .sort({ priority: -1 });

  // Load promo code promotion if provided
  let codePromo = null;
  if (promoCode) {
    try {
      codePromo = await validatePromoCode(promoCode, storeId);
    } catch {
      // Invalid code — ignore silently so sale can still proceed
    }
  }

  const promotionsToApply = [
    ...autoPromos.map((ap) => ap.promotion || ap),
    ...(codePromo ? [codePromo] : []),
  ].filter(Boolean);

  // Work on a mutable copy of items
  let workItems = items.map((item) => ({ ...item }));
  const promotionsApplied = [];
  let totalDiscount = 0;

  for (const promo of promotionsToApply) {
    const qualifying = workItems.filter((item) => itemQualifies(item, promo));
    if (qualifying.length === 0) continue;

    let discountAmount = 0;

    switch (promo.type) {
      case 'multi-buy': {
        // Buy N items for a fixed price
        const { buyQuantity, forPrice } = promo.params;
        if (!buyQuantity || !forPrice) break;
        const totalQty = qualifying.reduce((s, i) => s + i.quantity, 0);
        const groupsApplicable = Math.floor(totalQty / buyQuantity);
        if (groupsApplicable === 0) break;

        const originalCost = qualifying.reduce((s, i) => s + i.lineTotal, 0);
        const discountedCost = groupsApplicable * forPrice +
          (originalCost - qualifying.slice(0, groupsApplicable).reduce((s, i) => s + i.lineTotal, 0));
        discountAmount = Math.max(0, originalCost - (groupsApplicable * forPrice));
        discountAmount = Math.round(discountAmount * 100) / 100;
        break;
      }

      case 'bogof':
      case 'buy-x-get-y-free': {
        const buyQ = promo.params.buyQuantity || 2;
        const getQ = promo.params.getQuantity || 1;
        const totalQty = qualifying.reduce((s, i) => s + i.quantity, 0);
        const sets = Math.floor(totalQty / (buyQ + getQ)) + (totalQty % (buyQ + getQ) >= buyQ ? 1 : 0);
        const freeItems = Math.min(sets * getQ, totalQty - sets * buyQ);
        // Cheapest items are free
        const sortedPrices = qualifying
          .flatMap((i) => Array(i.quantity).fill(i.unitPrice))
          .sort((a, b) => a - b);
        discountAmount = sortedPrices.slice(0, freeItems).reduce((s, p) => s + p, 0);
        discountAmount = Math.round(discountAmount * 100) / 100;
        break;
      }

      case 'percentage':
      case 'category-discount': {
        const pct = promo.params.percentOff || 0;
        discountAmount = qualifying.reduce((s, i) => s + i.lineTotal * (pct / 100), 0);
        discountAmount = Math.round(discountAmount * 100) / 100;
        break;
      }

      case 'fixed': {
        discountAmount = promo.params.amountOff || 0;
        discountAmount = Math.min(discountAmount, qualifying.reduce((s, i) => s + i.lineTotal, 0));
        break;
      }

      case 'spend-threshold': {
        const cartTotal = workItems.reduce((s, i) => s + i.lineTotal, 0);
        if (cartTotal >= promo.params.spendAmount) {
          discountAmount = promo.params.discountAmount || 0;
        }
        break;
      }

      case 'bundle': {
        // All bundle products must be present
        const bundleIds = (promo.params.bundleProducts || []).map((p) => p.toString());
        const presentIds = workItems
          .filter((i) => i.productId)
          .map((i) => i.productId.toString());
        const allPresent = bundleIds.every((id) => presentIds.includes(id));
        if (allPresent) {
          const currentBundle = workItems
            .filter((i) => bundleIds.includes(i.productId?.toString()))
            .reduce((s, i) => s + i.lineTotal, 0);
          discountAmount = Math.max(0, currentBundle - (promo.params.bundlePrice || 0));
        }
        break;
      }

      default:
        break;
    }

    if (discountAmount > 0) {
      promotionsApplied.push({
        promotionId: promo._id,
        name: promo.name,
        discountAmount: Math.round(discountAmount * 100) / 100,
      });
      totalDiscount += discountAmount;
    }
  }

  totalDiscount = Math.round(totalDiscount * 100) / 100;
  return { items: workItems, promotionsApplied, totalDiscount };
}

/**
 * Record usage of a promotion after a sale completes.
 */
async function recordUsage(promotionId, discountAmount) {
  await Promotion.findByIdAndUpdate(promotionId, {
    $inc: { timesUsed: 1, totalDiscountGiven: discountAmount, 'limits.currentUsesTotal': 1 },
  });
}

module.exports = { applyPromotions, recordUsage, validatePromoCode, syncActivePromotions };
