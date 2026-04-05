const { Schema, model, Types: { ObjectId } } = require('mongoose');

const RefundSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  originalSale: { type: ObjectId, ref: 'Sale', required: true },
  receiptNumber: String,
  refundReceiptNumber: String,
  processedBy: { type: ObjectId, ref: 'Staff', required: true },
  processedByName: String,
  authorisedBy: { type: ObjectId, ref: 'Staff' },
  authorisedByName: String,
  items: [{
    product: { type: ObjectId, ref: 'Product' },
    barcode: String,
    name: String,
    quantity: Number,
    unitPrice: Number,
    lineTotal: Number,
    stockRestored: { type: Boolean, default: true },
  }],
  refundAmount: { type: Number, required: true },
  refundMethod: {
    type: String,
    enum: ['original_payment', 'cash', 'gift_card'],
    default: 'original_payment',
  },
  reason: { type: String, required: true },
  notes: String,
  processedAt: { type: Date, default: Date.now },
}, { timestamps: true });

RefundSchema.index({ store: 1, originalSale: 1 });
RefundSchema.index({ store: 1, processedAt: -1 });

module.exports = model('Refund', RefundSchema);
