const { Schema, model, Types: { ObjectId } } = require('mongoose');

const NoSaleLogSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  tillId: { type: String, required: true },
  staff: { type: ObjectId, ref: 'Staff', required: true },
  staffName: String,
  reason: {
    type: String,
    enum: ['give_change', 'check_price', 'customer_request', 'error_correction', 'other'],
    required: true,
  },
  customReason: String,
  duration: Number,
  cctvReference: String,
  flagged: { type: Boolean, default: false },
  flagReason: String,
  reviewedBy: { type: ObjectId, ref: 'Staff' },
  occurredAt: { type: Date, default: Date.now },
}, { timestamps: true });

NoSaleLogSchema.index({ store: 1, occurredAt: -1 });
NoSaleLogSchema.index({ store: 1, staff: 1, occurredAt: -1 });
NoSaleLogSchema.index({ store: 1, flagged: 1 });

module.exports = model('NoSaleLog', NoSaleLogSchema);
