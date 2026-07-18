'use strict';
const { model: Subscription } = require('../models/Subscription');

const FEATURE_PLAN_MAP = {
  lossPrevention: 'plus', loyaltyGiftCards: 'plus', smartReorder: 'plus',
  mobileApp: 'plus', clickCollect: 'plus', selfCheckout: 'plus',
  staffScheduling: 'plus', xeroSync: 'pro', quickbooksSync: 'pro',
  scheduledReports: 'pro', apiAccess: 'pro', multiStore: 'pro',
  customReports: 'pro', prioritySupport: 'pro',
};

const checkFeature = (featureName) => async (req, res, next) => {
  try {
    const sub = await Subscription.findOne({ store: req.storeId });
    if (!sub) return next(); // no subscription = trial, allow all
    if (sub.features[featureName] === true || sub.features[featureName] > 0) return next();
    return res.status(403).json({
      success: false,
      error: {
        code: 'FEATURE_LOCKED',
        message: `This feature requires an upgrade`,
        feature: featureName,
        currentPlan: sub.plan,
        requiredPlan: FEATURE_PLAN_MAP[featureName] || 'plus',
      }
    });
  } catch (err) { next(err); }
};

module.exports = checkFeature;
