const { Schema, model, Types: { ObjectId } } = require('mongoose');

const PromotionSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  name: { type: String, required: true },
  code: String,
  type: {
    type: String,
    enum: [
      'multi-buy', 'bogof', 'percentage', 'fixed', 'bundle',
      'buy-x-get-y-free', 'category-discount', 'spend-threshold', 'loyalty-multiplier',
    ],
    required: true,
  },
  applicableTo: {
    type: { type: String, enum: ['all', 'products', 'categories'], default: 'all' },
    products: [{ type: ObjectId, ref: 'Product' }],
    barcodes: [String],
    categories: [String],
  },
  params: {
    buyQuantity: Number,
    forPrice: Number,
    getQuantity: Number,
    percentOff: Number,
    amountOff: Number,
    fixedPrice: Number,
    bundleProducts: [{ type: ObjectId, ref: 'Product' }],
    bundlePrice: Number,
    spendAmount: Number,
    discountAmount: Number,
    pointsMultiplier: Number,
  },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  timeRestrictions: {
    enabled: { type: Boolean, default: false },
    daysOfWeek: [{ type: Number, min: 0, max: 6 }],
    startTime: String,
    endTime: String,
  },
  limits: {
    maxUsesTotal: Number,
    maxUsesPerCustomer: Number,
    currentUsesTotal: { type: Number, default: 0 },
  },
  customerRestrictions: {
    loyaltyMembersOnly: { type: Boolean, default: false },
    minLoyaltyTier: { type: String, enum: ['bronze', 'silver', 'gold', 'platinum'] },
  },
  isActive: { type: Boolean, default: false },
  autoApply: { type: Boolean, default: false },
  priority: { type: Number, default: 0 },
  stackable: { type: Boolean, default: false },
  timesUsed: { type: Number, default: 0 },
  totalDiscountGiven: { type: Number, default: 0 },
}, { timestamps: true });

PromotionSchema.index({ store: 1, isActive: 1 });
PromotionSchema.index({ store: 1, code: 1 });

module.exports = model('Promotion', PromotionSchema);
