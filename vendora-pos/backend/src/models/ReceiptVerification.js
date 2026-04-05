const { Schema, model, Types: { ObjectId } } = require('mongoose');

const ReceiptVerificationSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  sale: { type: ObjectId, ref: 'Sale' },
  receiptNumber: String,
  verifiedBy: { type: ObjectId, ref: 'Staff', required: true },
  verifiedByName: String,
  method: { type: String, enum: ['barcode_scan', 'manual_entry', 'visual_check'], required: true },
  result: { type: String, enum: ['matched', 'discrepancy', 'not_found'], required: true },
  discrepancies: [{
    type: String,
    description: String,
  }],
  customerReaction: String,
  actionTaken: String,
  cctvReference: String,
  occurredAt: { type: Date, default: Date.now },
}, { timestamps: true });

ReceiptVerificationSchema.index({ store: 1, occurredAt: -1 });

module.exports = model('ReceiptVerification', ReceiptVerificationSchema);
