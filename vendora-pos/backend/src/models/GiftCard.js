const { Schema, model, Types: { ObjectId } } = require('mongoose');

const GiftCardSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  code: { type: String, required: true, unique: true },
  pin: String,
  originalAmount: { type: Number, required: true },
  currentBalance: { type: Number, required: true },
  type: {
    type: String,
    enum: ['standard', 'promotional', 'refund', 'loyalty-reward'],
    default: 'standard',
  },
  status: {
    type: String,
    enum: ['active', 'depleted', 'expired', 'disabled'],
    default: 'active',
  },
  customer: { type: ObjectId, ref: 'Customer' },
  recipient: {
    name: String,
    email: String,
    phone: String,
    message: String,
  },
  issuedAt: { type: Date, default: Date.now },
  issuedBy: { type: ObjectId, ref: 'Staff' },
  expiresAt: Date,
  transactions: [{
    type: { type: String, enum: ['issue', 'redeem', 'topup', 'refund', 'adjust'] },
    amount: Number,
    balanceAfter: Number,
    saleId: ObjectId,
    staffId: ObjectId,
    notes: String,
    createdAt: { type: Date, default: Date.now },
  }],
  isDigital: { type: Boolean, default: false },
}, { timestamps: true });

GiftCardSchema.index({ store: 1, code: 1 });
GiftCardSchema.index({ store: 1, status: 1 });

module.exports = model('GiftCard', GiftCardSchema);
