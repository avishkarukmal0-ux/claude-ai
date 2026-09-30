'use strict';

// PWA shop-owner account — the PWA's OWN account record (email + password), separate from the
// till's Staff model (ADR-002: App/Till separation). One account == one shop workspace; the shop id
// the PWA uses is this document's _id.
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const accountSchema = new mongoose.Schema(
  {
    email: {
      type: String, required: true, unique: true, lowercase: true, trim: true, index: true,
    },
    passwordHash: { type: String, required: true },
    shopName: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

accountSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(String(password), this.passwordHash);
};

accountSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
};

// Guard against model recompilation in watch/test runs.
module.exports = mongoose.models.PwaAccount || mongoose.model('PwaAccount', accountSchema);
