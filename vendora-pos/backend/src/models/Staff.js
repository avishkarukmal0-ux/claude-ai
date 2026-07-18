const { Schema, model, Types: { ObjectId } } = require('mongoose');
const bcrypt = require('bcryptjs');

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

// Defense-in-depth: hash any plaintext credentials before save.
// Routes and seedData already hash before writing, so this is a safety net.
// Checks for bcrypt prefix to avoid double-hashing.
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;
async function maybeHash(value) {
  if (!value || value.startsWith('$2')) return value; // already hashed
  return bcrypt.hash(value, BCRYPT_ROUNDS);
}

StaffSchema.pre('save', async function (next) {
  if (this.isModified('pin'))       this.pin       = await maybeHash(this.pin);
  if (this.isModified('duressPin')) this.duressPin = await maybeHash(this.duressPin);
  if (this.isModified('password'))  this.password  = await maybeHash(this.password);
  next();
});

StaffSchema.methods.verifyPin = function (pin) {
  return bcrypt.compare(pin, this.pin);
};

module.exports = model('Staff', StaffSchema);
