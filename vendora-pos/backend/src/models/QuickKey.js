const { Schema, model, Types: { ObjectId } } = require('mongoose');

const QuickKeySchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  layout: { type: ObjectId, ref: 'QuickKeyLayout' },
  label: { type: String, required: true },
  type: { type: String, enum: ['product', 'price-lookup', 'misc'], default: 'product' },
  product: { type: ObjectId, ref: 'Product' },
  barcode: String,
  price: Number,
  icon: String,
  colorIndex: { type: Number, default: 0 },
  position: { type: Number, default: 0 },
  defaultQuantity: { type: Number, default: 1 },
  disabled: { type: Boolean, default: false },
}, { timestamps: true });

QuickKeySchema.index({ store: 1, layout: 1, position: 1 });

module.exports = model('QuickKey', QuickKeySchema);
