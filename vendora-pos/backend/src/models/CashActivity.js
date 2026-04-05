const { Schema, model, Types: { ObjectId } } = require('mongoose');

const denominationSchema = new Schema({
  notes: {
    fifty: { type: Number, default: 0 },
    twenty: { type: Number, default: 0 },
    ten: { type: Number, default: 0 },
    five: { type: Number, default: 0 },
  },
  coins: {
    twoPound: { type: Number, default: 0 },
    onePound: { type: Number, default: 0 },
    fiftyP: { type: Number, default: 0 },
    twentyP: { type: Number, default: 0 },
    tenP: { type: Number, default: 0 },
    fiveP: { type: Number, default: 0 },
    twoP: { type: Number, default: 0 },
    oneP: { type: Number, default: 0 },
  },
}, { _id: false });

const CashActivitySchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  tillId: { type: String, required: true },
  type: {
    type: String,
    enum: [
      'opening_float', 'cash_sale', 'cash_refund', 'safe_drop', 'payout',
      'cash_received', 'drawer_open', 'shift_start', 'shift_end', 'handover',
      'quick_confirm', 'full_count', 'variance_adjustment', 'closing',
    ],
    required: true,
  },
  amount: { type: Number, default: 0 },
  balanceAfter: Number,
  staff: { type: ObjectId, ref: 'Staff' },
  staffName: String,
  saleId: { type: ObjectId, ref: 'Sale' },
  receiptNumber: String,
  description: String,
  notes: String,
  handoverTo: { type: ObjectId, ref: 'Staff' },
  declaredAmount: Number,
  expectedAmount: Number,
  variance: Number,
  denominations: denominationSchema,
  occurredAt: { type: Date, default: Date.now },
}, { timestamps: true });

CashActivitySchema.index({ store: 1, tillId: 1, occurredAt: -1 });

module.exports = model('CashActivity', CashActivitySchema);
