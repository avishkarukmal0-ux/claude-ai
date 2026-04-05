const { Schema, model, Types: { ObjectId } } = require('mongoose');

// Lightweight product cache for offline POS operations
const ProductCacheSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  tillId: String,
  products: [{
    productId: ObjectId,
    barcode: String,
    name: String,
    price: Number,
    vatRate: String,
    ageRestricted: Boolean,
    minimumAge: Number,
    category: String,
  }],
  lastUpdated: { type: Date, default: Date.now },
}, { timestamps: true });

ProductCacheSchema.index({ store: 1, tillId: 1 });

module.exports = model('ProductCache', ProductCacheSchema);
