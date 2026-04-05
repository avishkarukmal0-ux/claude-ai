const { Schema, model, Types: { ObjectId } } = require('mongoose');

const DigitalReceiptSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  receiptNumber: { type: String, required: true },
  sale: { type: ObjectId, ref: 'Sale', required: true },
  deliveryMethod: { type: String, enum: ['email', 'sms', 'both'], required: true },
  email: String,
  phone: String,
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed', 'bounced'],
    default: 'pending',
  },
  sentAt: Date,
  htmlContent: String,
  provider: String,
  errorMessage: String,
}, { timestamps: true });

DigitalReceiptSchema.index({ store: 1, receiptNumber: 1 });
DigitalReceiptSchema.index({ store: 1, sale: 1 });

module.exports = model('DigitalReceipt', DigitalReceiptSchema);
