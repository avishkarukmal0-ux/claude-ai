const { Schema, model, Types: { ObjectId } } = require('mongoose');

const CashDrawerSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  tillId: { type: String, required: true, default: 'TILL-1' },
  status: { type: String, enum: ['closed', 'open', 'counting', 'handover'], default: 'closed' },
  expectedAmount: { type: Number, default: 0 },
  openingFloat: { type: Number, default: 0 },
  targetFloat: { type: Number, default: 150 },
  sessionTotals: {
    cashIn: { type: Number, default: 0 },
    cashOut: { type: Number, default: 0 },
    safeDrops: { type: Number, default: 0 },
    cashReceived: { type: Number, default: 0 },
  },
  currentShift: {
    staffId: { type: ObjectId, ref: 'Staff' },
    staffName: String,
    startedAt: Date,
    openingAmount: Number,
  },
  lastVerification: {
    verifiedAt: Date,
    verifiedBy: { type: ObjectId, ref: 'Staff' },
    method: { type: String, enum: ['quick_confirm', 'full_count'] },
    declaredAmount: Number,
    variance: Number,
  },
  alertThreshold: { type: Number, default: 300 },
  dayStartedAt: Date,
}, { timestamps: true });

CashDrawerSchema.index({ store: 1, tillId: 1 }, { unique: true });

CashDrawerSchema.methods.calculateExpected = function () {
  return this.openingFloat + this.sessionTotals.cashIn - this.sessionTotals.cashOut - this.sessionTotals.safeDrops;
};

CashDrawerSchema.methods.recordCashSale = function (amount) {
  this.sessionTotals.cashIn += amount;
  this.expectedAmount = this.calculateExpected();
};

CashDrawerSchema.methods.recordRefund = function (amount) {
  this.sessionTotals.cashOut += amount;
  this.expectedAmount = this.calculateExpected();
};

CashDrawerSchema.methods.recordSafeDrop = function (amount) {
  this.sessionTotals.safeDrops += amount;
  this.expectedAmount = this.calculateExpected();
};

CashDrawerSchema.methods.recordPayout = function (amount) {
  this.sessionTotals.cashOut += amount;
  this.expectedAmount = this.calculateExpected();
};

CashDrawerSchema.methods.needsSafeDrop = function () {
  return this.expectedAmount > this.alertThreshold;
};

CashDrawerSchema.methods.getExcessCash = function () {
  return Math.max(0, this.expectedAmount - this.targetFloat);
};

CashDrawerSchema.methods.startNewDay = function (float, staffId, staffName) {
  this.openingFloat = float;
  this.expectedAmount = float;
  this.sessionTotals = { cashIn: 0, cashOut: 0, safeDrops: 0, cashReceived: 0 };
  this.currentShift = { staffId, staffName, startedAt: new Date(), openingAmount: float };
  this.status = 'open';
  this.dayStartedAt = new Date();
};

CashDrawerSchema.statics.getDrawer = async function (storeId, tillId = 'TILL-1') {
  let drawer = await this.findOne({ store: storeId, tillId });
  if (!drawer) {
    drawer = await this.create({ store: storeId, tillId });
  }
  return drawer;
};

module.exports = model('CashDrawer', CashDrawerSchema);
