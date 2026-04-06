const { Schema, model, Types: { ObjectId } } = require('mongoose');

const SaleSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  tillId: { type: String, default: 'TILL-1' },
  receiptNumber: { type: String, unique: true },
  staff: { type: ObjectId, ref: 'Staff', required: true },
  staffName: String,
  customer: { type: ObjectId, ref: 'Customer' },
  customerName: String,
  items: [{
    product: { type: ObjectId, ref: 'Product' },
    barcode: String,
    name: String,
    quantity: { type: Number, required: true },
    unitPrice: Number,
    costPrice: Number,
    discount: {
      type: { type: String, enum: ['percent', 'fixed'] },
      amount: Number,
      reason: String,
      authorisedBy: ObjectId,
    },
    lineTotal: Number,
    vatRate: String,
    vatAmount: Number,
    ageVerified: { type: Boolean, default: false },
    scanTime: Date,
    mobileTopupPhone: String,
  }],
  subtotal: Number,
  discountTotal: Number,
  vatBreakdown: [{ rate: String, netAmount: Number, vatAmount: Number }],
  total: Number,
  payments: [{
    method: {
      type: String,
      enum: ['cash', 'card', 'contactless', 'gift_card', 'loyalty_points', 'voucher', 'account', 'open_banking', 'tap_to_pay', 'mobile_topup'],
    },
    amount: Number,
    reference: String,
    cardLast4: String,
    cardType: String,
  }],
  cashDetails: { tendered: Number, change: Number },
  status: {
    type: String,
    enum: ['completed', 'voided', 'refunded', 'partially_refunded', 'parked'],
    default: 'completed',
  },
  voidedBy: { type: ObjectId, ref: 'Staff' },
  voidedByName: String,
  voidReason: String,
  voidedAt: Date,
  loyaltyPointsEarned: { type: Number, default: 0 },
  loyaltyPointsRedeemed: { type: Number, default: 0 },
  promotionsApplied: [{
    promotionId: ObjectId,
    name: String,
    discountAmount: Number,
  }],
  cctvReference: String,
  scanFlags: [{ type: String, details: String, flaggedAt: Date }],
  isTraining: { type: Boolean, default: false },
  completedAt: Date,
}, { timestamps: true });

SaleSchema.index({ store: 1, completedAt: -1 });
SaleSchema.index({ store: 1, staff: 1, completedAt: -1 });
SaleSchema.index({ receiptNumber: 1 });

module.exports = model('Sale', SaleSchema);
