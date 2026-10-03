'use strict';
const mongoose = require('mongoose');

const EXPENSE_CATEGORIES = [
  'stock_purchases',    // goods for resale
  'staff_wages',        // payroll payments
  'rent_rates',         // premises rent / business rates
  'utilities',          // electricity, gas, water
  'insurance',          // business insurance
  'equipment',          // fixtures, fittings, hardware
  'software',           // SaaS, licences
  'marketing',          // advertising, social media
  'professional_fees',  // accountant, legal
  'travel',             // mileage, transport
  'repairs',            // maintenance
  'packaging',          // bags, boxes
  'other',
];

const expenseSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },

  date:        { type: Date, required: true, index: true },
  category:    { type: String, enum: EXPENSE_CATEGORIES, required: true },
  description: { type: String, required: true },

  supplier:    { type: String },
  reference:   { type: String }, // invoice number

  // Amounts
  netAmount:   { type: Number, required: true, default: 0 }, // exc VAT
  vatAmount:   { type: Number, default: 0 },
  grossAmount: { type: Number, required: true, default: 0 }, // inc VAT

  vatRate:          { type: Number, default: 0 }, // 0, 5, or 20
  vatReclaimable:   { type: Boolean, default: false },

  // Linked purchase order (optional)
  purchaseOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseOrder' },

  // Receipt
  receiptUrl:   { type: String },
  receiptKey:   { type: String }, // S3/R2 key

  paymentMethod: { type: String, enum: ['cash', 'card', 'bacs', 'cheque', 'direct_debit', 'other'], default: 'card' },
  paymentStatus: { type: String, enum: ['unpaid', 'paid', 'partial'], default: 'paid' },

  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },

  notes: { type: String },
}, { timestamps: true });

expenseSchema.index({ store: 1, date: -1 });
expenseSchema.index({ store: 1, category: 1 });

module.exports = mongoose.model('Expense', expenseSchema);
module.exports.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
