'use strict';
const mongoose = require('mongoose');

const accountingSettingsSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, unique: true, index: true },

  // VAT settings
  vat: {
    registered:      { type: Boolean, default: false },
    vatNumber:       { type: String },                 // GB123456789
    scheme:          { type: String, enum: ['standard', 'flat_rate', 'cash_accounting', 'annual'], default: 'standard' },
    flatRate:        { type: Number },                 // % for flat rate scheme e.g. 12.5
    returnFrequency: { type: String, enum: ['monthly', 'quarterly', 'annual'], default: 'quarterly' },
    quarterGroup:    { type: String, enum: ['jan_apr_jul_oct', 'feb_may_aug_nov', 'mar_jun_sep_dec'], default: 'jan_apr_jul_oct' },
  },

  // Financial year
  financialYearStart: {
    month: { type: Number, default: 4, min: 1, max: 12 }, // 4 = April (UK default)
    day:   { type: Number, default: 6, min: 1, max: 31 }, // 6 = 6th April (UK tax year)
  },

  // Payroll settings
  payroll: {
    enabled:         { type: Boolean, default: false },
    frequency:       { type: String, enum: ['weekly', 'fortnightly', 'monthly'], default: 'monthly' },
    payDay:          { type: Number, default: 25, min: 1, max: 31 }, // day of month
    payeReference:   { type: String },    // HMRC PAYE ref
    accountsOfficeRef: { type: String },  // HMRC Accounts Office ref
    pensionProvider: { type: String },
    pensionRateEmployee: { type: Number, default: 5 },   // % of qualifying earnings
    pensionRateEmployer: { type: Number, default: 3 },
  },

  // Chart of accounts defaults
  defaultCostOfSalesCategory: { type: String, default: 'stock_purchases' },

  // Integration
  xeroConnected:      { type: Boolean, default: false },
  quickbooksConnected: { type: Boolean, default: false },
  sageConnected:       { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('AccountingSettings', accountingSettingsSchema);
