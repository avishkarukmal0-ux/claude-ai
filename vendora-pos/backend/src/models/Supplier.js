const { Schema, model, Types: { ObjectId } } = require('mongoose');

const SupplierSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  name: { type: String, required: true },
  code: { type: String, required: true },
  type: { type: String, enum: ['wholesaler', 'distributor', 'manufacturer', 'cash-and-carry'], default: 'wholesaler' },
  contact: {
    email: String,
    phone: String,
    website: String,
    salesRep: String,
  },
  address: {
    line1: String,
    line2: String,
    city: String,
    postcode: String,
    country: { type: String, default: 'GB' },
  },
  ordering: {
    minimumOrder: Number,
    deliveryDays: [{ type: Number, min: 0, max: 6 }],
    leadTime: { type: Number, default: 1 },
    cutoffTime: String,
    deliveryCharge: { type: Number, default: 0 },
    freeDeliveryThreshold: Number,
  },
  payment: {
    terms: String,
    accountNumber: String,
    creditLimit: Number,
  },
  products: [{
    product: { type: ObjectId, ref: 'Product' },
    supplierSKU: String,
    supplierPrice: Number,
    packSize: { type: Number, default: 1 },
    lastUpdated: Date,
  }],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

SupplierSchema.index({ store: 1, code: 1 }, { unique: true });

module.exports = model('Supplier', SupplierSchema);
