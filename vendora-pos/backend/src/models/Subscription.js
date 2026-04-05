const { Schema, model, Types: { ObjectId } } = require('mongoose');

const SubscriptionSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true, unique: true },
  plan: { type: String, enum: ['free', 'plus', 'unlimited'], default: 'free' },
  status: { type: String, enum: ['active', 'past_due', 'cancelled', 'trial'], default: 'trial' },
  billing: {
    customerId: String,
    subscriptionId: String,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
  },
  features: {
    maxProducts: { type: Number, default: 100 },
    maxStaff: { type: Number, default: 3 },
    maxStores: { type: Number, default: 1 },
    supplierCount: { type: Number, default: 2 },
    advancedReports: { type: Boolean, default: false },
    loyaltyProgram: { type: Boolean, default: false },
    giftCards: { type: Boolean, default: false },
    apiAccess: { type: Boolean, default: false },
  },
  usage: {
    productCount: { type: Number, default: 0 },
    staffCount: { type: Number, default: 0 },
    monthlyTransactions: { type: Number, default: 0 },
  },
  trial: {
    startDate: Date,
    endDate: Date,
  },
}, { timestamps: true });

module.exports = model('Subscription', SubscriptionSchema);
