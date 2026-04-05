const { Schema, model } = require('mongoose');

const StoreSchema = new Schema({
  name: { type: String, required: true, trim: true },
  address: {
    line1: String,
    line2: String,
    city: String,
    postcode: String,
    country: { type: String, default: 'GB' },
  },
  phone: String,
  email: String,
  vatNumber: String,
  companyNumber: String,
  timezone: { type: String, default: 'Europe/London' },
  currency: { type: String, default: 'GBP' },
  settings: {
    targetFloat: { type: Number, default: 150 },
    alertThreshold: { type: Number, default: 300 },
    challenge25Enabled: { type: Boolean, default: true },
    loyaltyEnabled: { type: Boolean, default: true },
    loyaltyPointsPerPound: { type: Number, default: 1 },
    loyaltyPointValue: { type: Number, default: 0.01 },
    receiptHeader: String,
    receiptFooter: { type: String, default: 'Thank you for shopping with us!' },
    autoEmailReceipt: { type: Boolean, default: false },
    sessionTimeoutMins: { type: Number, default: 30 },
    requirePinForVoid: { type: Boolean, default: true },
    requirePinForRefund: { type: Boolean, default: true },
    requirePinForDiscount: { type: Boolean, default: true },
    noSaleRequiresReason: { type: Boolean, default: true },
    discountRequiresReason: { type: Boolean, default: true },
    maxDiscountWithoutApproval: { type: Number, default: 10 },
    challenge25Categories: {
      type: [String],
      default: ['alcohol', 'tobacco', 'vapes', 'knives', 'lottery'],
    },
  },
  lpSettings: {
    rapidScanThreshold: { type: Number, default: 2 },
    rapidScanMinItems: { type: Number, default: 5 },
    quantitySpikeThreshold: { type: Number, default: 10 },
    discountAlertPercent: { type: Number, default: 15 },
    highValueDiscountThreshold: { type: Number, default: 20 },
    varianceAlertThreshold: { type: Number, default: 5 },
    criticalVarianceThreshold: { type: Number, default: 20 },
    checkInInterval: { type: Number, default: 30 },
    missedCheckInsBeforeAlert: { type: Number, default: 2 },
  },
  openingHours: [
    {
      day: { type: Number, min: 0, max: 6 },
      open: String,
      close: String,
      closed: { type: Boolean, default: false },
    },
  ],
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = model('Store', StoreSchema);
