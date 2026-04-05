const { Schema, model, Types: { ObjectId } } = require('mongoose');

const ShrinkageLogSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  type: {
    type: String,
    enum: ['theft', 'damage', 'waste', 'admin_error', 'supplier_shortage', 'unknown'],
    required: true,
  },
  products: [{
    product: { type: ObjectId, ref: 'Product' },
    barcode: String,
    name: String,
    quantity: Number,
    unitCost: Number,
    totalCost: Number,
  }],
  totalValue: { type: Number, default: 0 },
  discoveredBy: { type: ObjectId, ref: 'Staff', required: true },
  discoveredByName: String,
  details: {
    location: String,
    description: String,
    suspectDescription: String,
    witnessNames: [String],
  },
  cctvReference: String,
  policeReference: String,
  insuranceClaim: String,
  status: { type: String, enum: ['reported', 'investigating', 'resolved', 'written_off'], default: 'reported' },
  occurredAt: { type: Date, default: Date.now },
}, { timestamps: true });

ShrinkageLogSchema.index({ store: 1, occurredAt: -1 });
ShrinkageLogSchema.index({ store: 1, status: 1 });

module.exports = model('ShrinkageLog', ShrinkageLogSchema);
