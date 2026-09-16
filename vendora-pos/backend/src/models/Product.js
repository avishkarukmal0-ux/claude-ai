const { Schema, model, Types: { ObjectId } } = require('mongoose');

const ProductSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  barcode: { type: String, required: true },
  sku: String,
  name: { type: String, required: true },
  shortName: String,
  description: String,
  category: { type: String, required: true },
  subcategory: String,
  brand: String,
  supplier: String,
  pricing: {
    costPrice: { type: Number, default: 0 },
    retailPrice: { type: Number, required: true },
    salePrice: Number,
    saleStartDate: Date,
    saleEndDate: Date,
    vatRate: { type: String, enum: ['standard', 'reduced', 'zero'], default: 'standard' },
    priceIncludesVat: { type: Boolean, default: true },
    // Per-product target margin override (%). Null/undefined = inherit the
    // product's category rule, then the store default. Lets an owner pin a
    // specific product's margin independent of its category.
    targetMargin: { type: Number, default: null },
  },
  stock: {
    quantity: { type: Number, default: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    reorderPoint: Number,
    reorderQuantity: Number,
    location: String,
  },
  attributes: {
    size: String,
    unit: String,
    weight: Number,
    isWeighed: { type: Boolean, default: false },
    ageRestricted: { type: Boolean, default: false },
    minimumAge: { type: Number, default: 18 },
    requiresChallenge25: { type: Boolean, default: false },
  },
  expiryTracking: {
    enabled: { type: Boolean, default: false },
    dates: [{ date: Date, quantity: Number }],
  },
  expiryBatches: [{
    batchId: { type: String, default: () => new ObjectId().toHexString() },
    quantity: { type: Number, default: 0 },
    expiryDate: { type: Date, required: true },
    receivedDate: { type: Date, default: Date.now },
    supplierId: { type: ObjectId, ref: 'Supplier' },
    costPrice: { type: Number, default: 0 },
    status: { type: String, enum: ['ok', 'expiring_soon', 'expired'], default: 'ok' },
  }],
  batchTracking: {
    enabled: { type: Boolean, default: false },
    batches: [{
      batchRef: String,
      quantity: Number,
      receivedDate: Date,
      expiryDate: Date,
      supplierId: ObjectId,
    }],
  },
  quickSellPosition: Number,
  imageUrl: String,
  tags: [String],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

ProductSchema.index({ store: 1, barcode: 1 });
ProductSchema.index({ store: 1, category: 1 });
ProductSchema.index({ name: 'text', barcode: 'text' });

module.exports = model('Product', ProductSchema);
