'use strict';

const mongoose = require('mongoose');

const ageRefusalSchema = new mongoose.Schema({
  store:         { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  staff:         { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  staffName:     { type: String, required: true },
  tillId:        { type: String, default: 'TILL-1' },
  productId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  productName:   { type: String, required: true },
  productBarcode:{ type: String },
  minimumAge:    { type: Number, default: 18 },
  refusalReason: {
    type: String,
    enum: ['no_id', 'id_invalid', 'underage', 'no_id_present', 'other'],
    default: 'no_id',
  },
  refusalNotes:  { type: String },
  occurredAt:    { type: Date, default: Date.now, index: true },
}, { timestamps: true });

ageRefusalSchema.index({ store: 1, occurredAt: -1 });
ageRefusalSchema.index({ store: 1, staff: 1, occurredAt: -1 });

module.exports = mongoose.model('AgeRefusal', ageRefusalSchema);
