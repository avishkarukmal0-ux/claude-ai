'use strict';
const mongoose = require('mongoose');

const categoryMarginSchema = new mongoose.Schema({
  name:         { type: String, required: true }, // e.g. "Beer", "Spirits"
  targetMargin: { type: Number, default: 30 },    // %
  minMargin:    { type: Number, default: 15 },    // alert if below
  maxMargin:    { type: Number, default: 0 },     // 0 = no upper cap
  vatRate:      { type: Number, default: 20 },    // 0, 5, or 20
}, { _id: false });

const marginSettingsSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, unique: true, index: true },

  defaultMargin: { type: Number, default: 30 }, // fallback for uncategorised

  categories: [categoryMarginSchema],

  // Global behaviour toggles
  alertBelowMinMargin: { type: Boolean, default: true },
  autoSuggestPrice:    { type: Boolean, default: true },
  showMarginOnPOS:     { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('MarginSettings', marginSettingsSchema);
