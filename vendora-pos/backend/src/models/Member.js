'use strict';

// PWA staff member — an individual login that belongs to ONE shop (a PwaAccount). The owner creates
// members from inside the app; each gets their own email + password and a role. A member's token always
// carries the OWNER account id as its shopId, so a member works inside the owner's single workspace and
// can never reach another shop's data (sync is scoped by that id). Separate from the till's Staff model
// (ADR-002): this is the PWA's own, self-contained staff layer.
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['manager', 'staff'];

const memberSchema = new mongoose.Schema(
  {
    // The shop this member belongs to (the PwaAccount id == the workspace/shop id).
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'PwaAccount', required: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ROLES, default: 'staff' },
    // Deactivated members keep their record (for attribution history) but can no longer sign in or
    // refresh — the owner can switch access off without deleting who-did-what.
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

memberSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(String(password), this.passwordHash);
};

memberSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
};

memberSchema.statics.ROLES = ROLES;

// Guard against model recompilation in watch/test runs.
module.exports = mongoose.models.PwaMember || mongoose.model('PwaMember', memberSchema);
