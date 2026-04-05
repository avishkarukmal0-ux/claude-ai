const { Schema, model, Types: { ObjectId } } = require('mongoose');

const PriceHistorySchema = new Schema({
  product: { type: ObjectId, ref: 'Product', required: true },
  barcode: String,
  supplier: { type: ObjectId, ref: 'Supplier' },
  supplierName: String,
  price: { type: Number, required: true },
  previousPrice: Number,
  changePercent: Number,
  source: { type: String, enum: ['invoice', 'manual', 'scrape', 'api'], default: 'manual' },
  recordedAt: { type: Date, default: Date.now },
}, { timestamps: true });

PriceHistorySchema.index({ product: 1, recordedAt: -1 });
PriceHistorySchema.index({ barcode: 1, recordedAt: -1 });

module.exports = model('PriceHistory', PriceHistorySchema);
