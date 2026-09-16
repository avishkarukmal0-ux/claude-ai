'use strict';
const { Schema, model, Types: { ObjectId } } = require('mongoose');

const ScannedInvoiceItemSchema = new Schema({
  rawText:        String,
  barcode:        String,
  productName:    String,
  quantity:       { type: Number, default: 1 },
  unitCost:       { type: Number, default: 0 },
  totalCost:      { type: Number, default: 0 },
  matchedProduct: { type: ObjectId, ref: 'Product' },
  matchConfidence:{ type: Number, min: 0, max: 1, default: 0 },
  matchMethod:    { type: String, enum: ['barcode', 'name', 'manual', 'none'], default: 'none' },
  previousCost:   Number,
  priceChanged:   { type: Boolean, default: false },
  changePercent:  Number,
  changeDirection:{ type: String, enum: ['up', 'down', 'none'], default: 'none' },
  isNewProduct:   { type: Boolean, default: false },
  applyUpdate:    { type: Boolean, default: true },
  marginAfter:    Number,
  marginWarning:  { type: Boolean, default: false },
}, { _id: false });

const ScannedInvoiceSchema = new Schema({
  store:          { type: ObjectId, ref: 'Store', required: true },
  supplier:       { type: ObjectId, ref: 'Supplier' },
  supplierName:   String,
  invoiceNumber:  String,
  invoiceDate:    Date,
  uploadedAt:     { type: Date, default: Date.now },
  uploadedBy:     { type: ObjectId, ref: 'Staff' },
  source:         { type: String, enum: ['camera', 'pdf', 'image'], default: 'image' },
  rawImageUrl:    String,
  rawText:        String,
  status: {
    type: String,
    enum: ['processing', 'review', 'applied', 'rejected'],
    default: 'processing',
  },
  items: [ScannedInvoiceItemSchema],
  summary: {
    totalItems:    { type: Number, default: 0 },
    matchedItems:  { type: Number, default: 0 },
    unmatchedItems:{ type: Number, default: 0 },
    priceIncreases:{ type: Number, default: 0 },
    priceDecreases:{ type: Number, default: 0 },
    newProducts:   { type: Number, default: 0 },
    totalValue:    { type: Number, default: 0 },
  },
}, { timestamps: true });

ScannedInvoiceSchema.index({ store: 1, createdAt: -1 });
ScannedInvoiceSchema.index({ store: 1, status: 1 });

module.exports = model('ScannedInvoice', ScannedInvoiceSchema);
