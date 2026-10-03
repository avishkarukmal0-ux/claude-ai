'use strict';
const express = require('express');
const router = express.Router();
const Store = require('../models/Store');
const { requireRole } = require('../middleware/permissions');
const AppError = require('../utils/AppError');

// Fields that may be updated via the settings page
const TOP_LEVEL_FIELDS = ['name', 'address', 'phone', 'email', 'vatNumber', 'currency', 'timezone'];

// GET /settings — return store config + settings sub-object merged
router.get('/', requireRole('manager'), async (req, res, next) => {
  try {
    const store = await Store.findById(req.storeId).lean();
    if (!store) return next(AppError.notFound('Store'));

    const settings = {
      name: store.name,
      address: store.address,
      phone: store.phone,
      email: store.email,
      vatNumber: store.vatNumber,
      currency: store.currency,
      timezone: store.timezone,
      // POS / cash drawer
      targetFloat: store.settings?.targetFloat,
      alertThreshold: store.settings?.alertThreshold,
      // Receipt
      receiptHeader: store.settings?.receiptHeader,
      receiptFooter: store.settings?.receiptFooter,
      autoEmailReceipt: store.settings?.autoEmailReceipt,
      // Security / PIN
      sessionTimeoutMins: store.settings?.sessionTimeoutMins,
      requirePinForVoid: store.settings?.requirePinForVoid,
      requirePinForRefund: store.settings?.requirePinForRefund,
      requirePinForDiscount: store.settings?.requirePinForDiscount,
      noSaleRequiresReason: store.settings?.noSaleRequiresReason,
      discountRequiresReason: store.settings?.discountRequiresReason,
      maxDiscountWithoutApproval: store.settings?.maxDiscountWithoutApproval,
      // Loyalty
      loyaltyEnabled: store.settings?.loyaltyEnabled,
      loyaltyPointsPerPound: store.settings?.loyaltyPointsPerPound,
      loyaltyPointValue: store.settings?.loyaltyPointValue,
      // Challenge 25
      challenge25Enabled: store.settings?.challenge25Enabled,
      challenge25Categories: store.settings?.challenge25Categories,
    };

    res.json({ success: true, settings });
  } catch (err) { next(err); }
});

// PUT /settings — update store config + settings sub-object
router.put('/', requireRole('manager'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const updateDoc = {};

    // Top-level store fields
    for (const field of TOP_LEVEL_FIELDS) {
      if (body[field] !== undefined) updateDoc[field] = body[field];
    }

    // Settings sub-document (dot notation so we don't overwrite the whole object)
    const settingsKeys = [
      'targetFloat', 'alertThreshold',
      'receiptHeader', 'receiptFooter', 'autoEmailReceipt',
      'sessionTimeoutMins',
      'requirePinForVoid', 'requirePinForRefund', 'requirePinForDiscount',
      'noSaleRequiresReason', 'discountRequiresReason', 'maxDiscountWithoutApproval',
      'loyaltyEnabled', 'loyaltyPointsPerPound', 'loyaltyPointValue',
      'challenge25Enabled', 'challenge25Categories',
    ];
    for (const key of settingsKeys) {
      if (body[key] !== undefined) updateDoc[`settings.${key}`] = body[key];
    }

    await Store.findByIdAndUpdate(req.storeId, { $set: updateDoc });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
