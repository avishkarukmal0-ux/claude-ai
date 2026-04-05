const { Schema, model, Types: { ObjectId } } = require('mongoose');

const InvoiceSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  invoiceNumber: { type: String, required: true },
  supplierInvoiceRef: String,
  supplier: { type: ObjectId, ref: 'Supplier', required: true },
  purchaseOrder: { type: ObjectId, ref: 'PurchaseOrder' },
  invoiceDate: { type: Date, required: true },
  dueDate: Date,
  items: [{
    product: { type: ObjectId, ref: 'Product' },
    barcode: String,
    name: String,
    quantity: Number,
    unitPrice: Number,
    lineTotal: Number,
    expectedPrice: Number,
    priceDifference: Number,
    priceIncreased: { type: Boolean, default: false },
    matchConfidence: { type: Number, min: 0, max: 100 },
    needsReview: { type: Boolean, default: false },
    reviewStatus: {
      type: String,
      enum: ['pending', 'approved', 'disputed', 'resolved'],
      default: 'pending',
    },
  }],
  totals: {
    subtotal: Number,
    vat: { type: Number, default: 0 },
    total: Number,
  },
  verification: {
    status: { type: String, enum: ['unverified', 'verified', 'discrepancies', 'disputed'], default: 'unverified' },
    priceIncreases: { type: Number, default: 0 },
    priceDecreases: { type: Number, default: 0 },
    totalOvercharge: { type: Number, default: 0 },
    netDifference: { type: Number, default: 0 },
    verifiedAt: Date,
    verifiedBy: { type: ObjectId, ref: 'Staff' },
  },
  paymentStatus: {
    type: String,
    enum: ['unpaid', 'partial', 'paid', 'disputed'],
    default: 'unpaid',
  },
  entryMethod: {
    type: String,
    enum: ['manual', 'scan', 'import', 'api'],
    default: 'manual',
  },
  notes: String,
}, { timestamps: true });

InvoiceSchema.index({ store: 1, supplier: 1 });
InvoiceSchema.index({ store: 1, paymentStatus: 1 });

module.exports = model('Invoice', InvoiceSchema);
