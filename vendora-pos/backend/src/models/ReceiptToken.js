'use strict';

const { Schema, model, Types: { ObjectId } } = require('mongoose');

const ReceiptTokenSchema = new Schema({
  store: { type: ObjectId, ref: 'Store' },
  sale: { type: ObjectId, ref: 'Sale', required: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  viewedAt: Date,
}, { timestamps: true });

ReceiptTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('ReceiptToken', ReceiptTokenSchema);
