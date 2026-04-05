const { Schema, model, Types: { ObjectId } } = require('mongoose');

const StaffSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  employeeId: { type: String, required: true },
  displayName: { type: String, required: true },
  email: String,
  phone: String,
  pin: { type: String, required: true },
  duressPin: String,
  password: String,
  role: { type: String, enum: ['cashier', 'supervisor', 'manager', 'owner'], default: 'cashier' },
  permissions: {
    canVoid: { type: Boolean, default: false },
    canRefund: { type: Boolean, default: false },
    canDiscount: { type: Boolean, default: false },
    canOpenDrawer: { type: Boolean, default: true },
    canViewReports: { type: Boolean, default: false },
    canManageProducts: { type: Boolean, default: false },
    canManageStaff: { type: Boolean, default: false },
    maxDiscountPercent: { type: Number, default: 10 },
    maxRefundAmount: { type: Number, default: 50 },
  },
  dailyLimits: {
    voidLimit: { type: Number, default: 3 },
    refundLimit: { type: Number, default: 5 },
    discountLimit: { type: Number, default: 100 },
  },
  dailyCounters: {
    voids: { count: { type: Number, default: 0 }, amount: { type: Number, default: 0 }, lastReset: Date },
    refunds: { count: { type: Number, default: 0 }, amount: { type: Number, default: 0 }, lastReset: Date },
    discounts: { count: { type: Number, default: 0 }, amount: { type: Number, default: 0 }, lastReset: Date },
  },
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: String,
  timeClock: {
    isOnClock: { type: Boolean, default: false },
    currentShiftStart: Date,
    currentBreakStart: Date,
    onBreak: { type: Boolean, default: false },
  },
  shifts: [{
    clockIn: Date,
    clockOut: Date,
    breakMinutes: { type: Number, default: 0 },
    tillId: String,
    totalSales: Number,
    totalTransactions: Number,
    notes: String,
  }],
  payroll: {
    hourlyRate: Number,
    overtimeRate: Number,
    weeklyHours: { type: Number, default: 40 },
  },
  status: { type: String, enum: ['active', 'suspended', 'terminated'], default: 'active' },
  lastLogin: Date,
}, { timestamps: true });

StaffSchema.index({ store: 1, employeeId: 1 }, { unique: true });
StaffSchema.index({ store: 1, status: 1 });

module.exports = model('Staff', StaffSchema);
