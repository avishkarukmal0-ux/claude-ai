'use strict';

// PWA shop-owner account — the PWA's OWN account record (email + password), separate from the
// till's Staff model (ADR-002: App/Till separation). One account == one shop workspace; the shop id
// the PWA uses is this document's _id.
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Daily digest notification preferences (opt-in, all off by default). Stored on the account because the
// server decides due-ness and sends the email. Times are Europe/London hours (0–23).
const notifySchema = new mongoose.Schema(
  {
    email: { enabled: { type: Boolean, default: false } },
    categories: {
      expiry: { type: Boolean, default: true },
      claims: { type: Boolean, default: true },
      tasks: { type: Boolean, default: true },
    },
    expiryDays: { type: Number, default: 3 },     // "expiring" = within this many days
    sendHour: { type: Number, default: 7 },        // local hour to send the morning digest
    quietFrom: { type: Number, default: 21 },      // no sends from quietFrom…
    quietTo: { type: Number, default: 7 },         // …until quietTo (wraps midnight)
    snoozeUntil: { type: Number, default: 0 },     // epoch ms; suppress all sends until then
    recipient: { type: String, default: '' },      // defaults to the owner email when blank
    lastSentDay: { type: String, default: '' },    // 'YYYY-MM-DD' (London) — once-per-day guard
  },
  { _id: false },
);

// Paid add-on entitlements (server-enforced). Additive + lazy: existing accounts get the default (no access)
// on first read/write. Each entitlement is scoped to THIS account (the shop). Nothing here is the deferred
// till subscription — that is a separate, Store-scoped model behind TILL_ENABLED.
const entitlementSchema = new mongoose.Schema(
  {
    status: { type: String, enum: ['none', 'active', 'past_due', 'cancelled'], default: 'none' },
    plan: { type: String, enum: ['none', 'subscription', 'one_off'], default: 'none' },
    source: { type: String, default: null },        // e.g. 'stripe' | 'comp' (how it was granted)
    reference: { type: String, default: null },     // provider reference (e.g. subscription id)
    grantedAt: { type: Number, default: null },     // epoch ms
    currentPeriodEnd: { type: Number, default: null }, // epoch ms; access lapses after this when set
    cancelledAt: { type: Number, default: null },
    note: { type: String, default: '' },
    // Provider mapping (server-side only; never set from client input). Links this shop to its Stripe records
    // so a webhook can be resolved to the authorised account and the add-on cancelled without touching core.
    customerId: { type: String, default: null },       // Stripe customer id
    subscriptionId: { type: String, default: null },   // Stripe subscription id (core + optional add-on items)
    itemId: { type: String, default: null },           // the add-on's subscription item id (for add-on-only cancel)
    priceId: { type: String, default: null },
    // Out-of-order / duplicate webhook guard: the created-time (ms) and id of the last applied provider event.
    lastEventAt: { type: Number, default: null },
    lastEventId: { type: String, default: null },
  },
  { _id: false },
);

const entitlementsSchema = new mongoose.Schema(
  { neighbourhoodInsights: { type: entitlementSchema, default: () => ({}) } },
  { _id: false },
);

const accountSchema = new mongoose.Schema(
  {
    email: {
      type: String, required: true, unique: true, lowercase: true, trim: true, index: true,
    },
    passwordHash: { type: String, required: true },
    shopName: { type: String, required: true, trim: true },
    notify: { type: notifySchema, default: () => ({}) },
    entitlements: { type: entitlementsSchema, default: () => ({}) },
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
