const { Schema, model, Types: { ObjectId } } = require('mongoose');

const DiscountPatternSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  staff: { type: ObjectId, ref: 'Staff', required: true },
  staffName: String,
  patternType: {
    type: String,
    enum: ['excessive_frequency', 'high_value', 'same_customer', 'end_of_shift', 'specific_products', 'round_amounts'],
    required: true,
  },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
  period: { start: Date, end: Date },
  metrics: {
    discountCount: Number,
    totalDiscountValue: Number,
    averageDiscount: Number,
    affectedTransactions: Number,
    comparisonToAverage: Number,
  },
  samples: [{
    saleId: ObjectId,
    receiptNumber: String,
    discountAmount: Number,
    discountPercent: Number,
    productName: String,
    occurredAt: Date,
  }],
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'escalated', 'dismissed', 'confirmed'],
    default: 'pending',
  },
  reviewedBy: { type: ObjectId, ref: 'Staff' },
  reviewedAt: Date,
  reviewNotes: String,
}, { timestamps: true });

DiscountPatternSchema.index({ store: 1, staff: 1 });
DiscountPatternSchema.index({ store: 1, status: 1 });

module.exports = model('DiscountPattern', DiscountPatternSchema);
