const { Schema, model, Types: { ObjectId } } = require('mongoose');

const ParkedTransactionSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  parkId: { type: String, required: true, unique: true },
  parkedBy: { type: ObjectId, ref: 'Staff', required: true },
  parkedByName: String,
  tillId: { type: String, required: true },
  items: [{
    product: { type: ObjectId, ref: 'Product' },
    barcode: String,
    name: String,
    quantity: Number,
    unitPrice: Number,
    lineTotal: Number,
    vatRate: String,
    discount: Schema.Types.Mixed,
  }],
  subtotal: Number,
  total: Number,
  itemCount: Number,
  customer: { type: ObjectId, ref: 'Customer' },
  customerName: String,
  reason: {
    type: String,
    enum: ['customer-waiting', 'payment-issue', 'price-check', 'manager-approval', 'customer-left', 'other'],
    default: 'other',
  },
  customerIdentifier: String,
  status: { type: String, enum: ['parked', 'resumed', 'expired', 'voided'], default: 'parked' },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 4 * 60 * 60 * 1000) },
  resumedBy: { type: ObjectId, ref: 'Staff' },
  resumedAt: Date,
}, { timestamps: true });

ParkedTransactionSchema.index({ store: 1, status: 1 });
ParkedTransactionSchema.index({ store: 1, tillId: 1 });
ParkedTransactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('ParkedTransaction', ParkedTransactionSchema);
