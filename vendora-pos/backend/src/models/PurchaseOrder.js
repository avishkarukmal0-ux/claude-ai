const { Schema, model, Types: { ObjectId } } = require('mongoose');

const PurchaseOrderSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  orderNumber: { type: String, required: true, unique: true },
  supplier: { type: ObjectId, ref: 'Supplier', required: true },
  supplierName: String,
  status: {
    type: String,
    enum: ['draft', 'sent', 'confirmed', 'partial', 'received', 'cancelled'],
    default: 'draft',
  },
  items: [{
    product: { type: ObjectId, ref: 'Product' },
    barcode: String,
    name: String,
    quantity: { type: Number, required: true },
    unitPrice: Number,
    packSize: { type: Number, default: 1 },
    lineTotal: Number,
    quantityReceived: { type: Number, default: 0 },
    receivedAt: Date,
  }],
  totals: {
    subtotal: Number,
    deliveryCharge: { type: Number, default: 0 },
    vat: { type: Number, default: 0 },
    total: Number,
  },
  delivery: {
    expectedDate: Date,
    actualDate: Date,
    notes: String,
  },
  orderMethod: { type: String, enum: ['manual', 'auto-reorder', 'shopping-list'], default: 'manual' },
  sentAt: Date,
  sentBy: { type: ObjectId, ref: 'Staff' },
  receivedBy: { type: ObjectId, ref: 'Staff' },
  notes: String,
}, { timestamps: true });

PurchaseOrderSchema.index({ store: 1, status: 1 });
PurchaseOrderSchema.index({ store: 1, supplier: 1 });

module.exports = model('PurchaseOrder', PurchaseOrderSchema);
