const { Schema, model, Types: { ObjectId } } = require('mongoose');

const StockTakeItemSchema = new Schema({
  stockTake: { type: ObjectId, ref: 'StockTake', required: true },
  store: { type: ObjectId, ref: 'Store', required: true },
  product: { type: ObjectId, ref: 'Product', required: true },
  barcode: String,
  productName: String,
  category: String,
  systemQuantity: { type: Number, required: true },
  countedQuantity: Number,
  variance: Number,
  varianceValue: Number,
  unitCost: Number,
  status: { type: String, enum: ['pending', 'counted', 'verified'], default: 'pending' },
  countedBy: { type: ObjectId, ref: 'Staff' },
  countedByName: String,
  countedAt: Date,
  notes: String,
}, { timestamps: true });

StockTakeItemSchema.index({ stockTake: 1, product: 1 });
StockTakeItemSchema.index({ stockTake: 1, status: 1 });

module.exports = model('StockTakeItem', StockTakeItemSchema);
