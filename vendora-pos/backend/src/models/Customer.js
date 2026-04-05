const { Schema, model, Types: { ObjectId } } = require('mongoose');

const CustomerSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  customerCode: { type: String, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: String,
  email: String,
  dateOfBirth: Date,
  loyalty: {
    points: { type: Number, default: 0 },
    tier: { type: String, enum: ['bronze', 'silver', 'gold', 'platinum'], default: 'bronze' },
    tierMultiplier: { type: Number, default: 1 },
    joinedAt: { type: Date, default: Date.now },
    enrolled: { type: Boolean, default: false },
    pointsHistory: [{
      type: { type: String, enum: ['earn', 'redeem', 'adjust', 'expire'] },
      points: Number,
      balanceAfter: Number,
      saleId: ObjectId,
      description: String,
      createdAt: { type: Date, default: Date.now },
    }],
  },
  stats: {
    totalSpent: { type: Number, default: 0 },
    totalTransactions: { type: Number, default: 0 },
    averageTransactionValue: { type: Number, default: 0 },
    firstPurchase: Date,
    lastPurchase: Date,
    topCategories: [{ category: String, spend: Number }],
  },
  marketing: {
    emailOptIn: { type: Boolean, default: false },
    smsOptIn: { type: Boolean, default: false },
  },
  ageVerification: {
    verified: { type: Boolean, default: false },
    verifiedAt: Date,
    method: { type: String, enum: ['passport', 'driving_licence', 'proof_of_age_card', 'other'] },
  },
  notes: String,
  tags: [String],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

CustomerSchema.index({ store: 1, phone: 1 });
CustomerSchema.index({ store: 1, email: 1 });
CustomerSchema.index({ customerCode: 1 });
CustomerSchema.index({ 'loyalty.enrolled': 1 });

module.exports = model('Customer', CustomerSchema);
