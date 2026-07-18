'use strict';
const { Schema, model, Types: { ObjectId } } = require('mongoose');

const ExpiryMarkdownRuleSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  daysBeforeExpiry: { type: Number, required: true },
  discountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  discountAmount: { type: Number, required: true },
  active: { type: Boolean, default: true },
}, { timestamps: true });

ExpiryMarkdownRuleSchema.index({ store: 1, daysBeforeExpiry: 1 });

module.exports = model('ExpiryMarkdownRule', ExpiryMarkdownRuleSchema);
