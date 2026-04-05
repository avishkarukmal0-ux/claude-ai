const { Schema, model, Types: { ObjectId } } = require('mongoose');

const StockMovementSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  product: { type: ObjectId, ref: 'Product', required: true },
  barcode: String,
  productName: String,
  type: {
    type: String,
    enum: ['sale', 'refund', 'adjustment', 'stocktake', 'purchase_order', 'transfer', 'waste'],
    required: true,
  },
  quantity: { type: Number, required: true },
  quantityBefore: Number,
  quantityAfter: Number,
  reference: String,
  reason: String,
  staff: { type: ObjectId, ref: 'Staff' },
  staffName: String,
  notes: String,
}, { timestamps: true });

StockMovementSchema.index({ store: 1, product: 1, createdAt: -1 });
StockMovementSchema.index({ store: 1, type: 1 });

module.exports = model('StockMovement', StockMovementSchema);
