'use strict';
const { Schema, model, Types: { ObjectId } } = require('mongoose');

const PLAN_FEATURES = {
  trial: {
    maxTills: 1, maxStaff: 5, maxProducts: 1000, maxStores: 1, maxWholesalers: 33,
    lossPrevention: true, loyaltyGiftCards: true, smartReorder: true,
    mobileApp: true, clickCollect: true, selfCheckout: true,
    xeroSync: true, quickbooksSync: true, scheduledReports: true,
    apiAccess: false, multiStore: false, customReports: true,
    prioritySupport: false, staffScheduling: true,
  },
  starter: {
    maxTills: 1, maxStaff: 3, maxProducts: 500, maxStores: 1, maxWholesalers: 5,
    lossPrevention: false, loyaltyGiftCards: false, smartReorder: false,
    mobileApp: false, clickCollect: false, selfCheckout: false,
    xeroSync: false, quickbooksSync: false, scheduledReports: false,
    apiAccess: false, multiStore: false, customReports: false,
    prioritySupport: false, staffScheduling: false,
  },
  plus: {
    maxTills: 2, maxStaff: 10, maxProducts: 999999, maxStores: 1, maxWholesalers: 33,
    lossPrevention: true, loyaltyGiftCards: true, smartReorder: true,
    mobileApp: true, clickCollect: true, selfCheckout: true,
    xeroSync: false, quickbooksSync: false, scheduledReports: false,
    apiAccess: false, multiStore: false, customReports: false,
    prioritySupport: false, staffScheduling: true,
  },
  pro: {
    maxTills: 999, maxStaff: 999, maxProducts: 999999, maxStores: 5, maxWholesalers: 33,
    lossPrevention: true, loyaltyGiftCards: true, smartReorder: true,
    mobileApp: true, clickCollect: true, selfCheckout: true,
    xeroSync: true, quickbooksSync: true, scheduledReports: true,
    apiAccess: true, multiStore: true, customReports: true,
    prioritySupport: true, staffScheduling: true,
  },
};

const featuresSchema = new Schema({
  maxTills: { type: Number, default: 1 },
  maxStaff: { type: Number, default: 5 },
  maxProducts: { type: Number, default: 1000 },
  maxStores: { type: Number, default: 1 },
  maxWholesalers: { type: Number, default: 33 },
  lossPrevention: { type: Boolean, default: true },
  loyaltyGiftCards: { type: Boolean, default: true },
  smartReorder: { type: Boolean, default: true },
  mobileApp: { type: Boolean, default: true },
  clickCollect: { type: Boolean, default: true },
  selfCheckout: { type: Boolean, default: true },
  xeroSync: { type: Boolean, default: false },
  quickbooksSync: { type: Boolean, default: false },
  scheduledReports: { type: Boolean, default: false },
  apiAccess: { type: Boolean, default: false },
  multiStore: { type: Boolean, default: false },
  customReports: { type: Boolean, default: true },
  prioritySupport: { type: Boolean, default: false },
  staffScheduling: { type: Boolean, default: true },
}, { _id: false });

const SubscriptionSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true, unique: true },
  plan: { type: String, enum: ['trial', 'starter', 'plus', 'pro'], default: 'trial' },
  status: { type: String, enum: ['active', 'past_due', 'cancelled', 'trial'], default: 'trial' },
  trialEndsAt: Date,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  cancelAtPeriodEnd: { type: Boolean, default: false },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  stripePriceId: String,
  features: { type: featuresSchema, default: () => ({ ...PLAN_FEATURES.trial }) },
}, { timestamps: true });

SubscriptionSchema.statics.PLAN_FEATURES = PLAN_FEATURES;

SubscriptionSchema.statics.createTrial = async function(storeId) {
  const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return this.findOneAndUpdate(
    { store: storeId },
    {
      store: storeId,
      plan: 'trial',
      status: 'trial',
      trialEndsAt,
      features: { ...PLAN_FEATURES.trial },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

module.exports = { model: model('Subscription', SubscriptionSchema), PLAN_FEATURES };
