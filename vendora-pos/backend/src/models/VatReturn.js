'use strict';
const mongoose = require('mongoose');

const vatReturnSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },

  period: {
    start: { type: Date, required: true },
    end:   { type: Date, required: true },
    quarter: { type: String }, // e.g. "Q1 2026"
  },

  status: { type: String, enum: ['draft', 'submitted', 'paid'], default: 'draft' },

  // HMRC VAT100 boxes
  box1: { type: Number, default: 0 }, // VAT due on sales
  box2: { type: Number, default: 0 }, // VAT due on EU acquisitions
  box3: { type: Number, default: 0 }, // Total VAT due (box1 + box2)
  box4: { type: Number, default: 0 }, // VAT reclaimed on purchases
  box5: { type: Number, default: 0 }, // Net VAT payable / reclaimable
  box6: { type: Number, default: 0 }, // Total value of sales exc VAT
  box7: { type: Number, default: 0 }, // Total value of purchases exc VAT
  box8: { type: Number, default: 0 }, // Total value of supplies to EU
  box9: { type: Number, default: 0 }, // Total value of acquisitions from EU

  salesBreakdown: {
    standardRated:     { type: Number, default: 0 }, // 20%
    reducedRated:      { type: Number, default: 0 }, // 5%
    zeroRated:         { type: Number, default: 0 }, // 0%
    exempt:            { type: Number, default: 0 },
    totalVatCollected: { type: Number, default: 0 },
  },
  purchasesBreakdown: {
    vatReclaimable:   { type: Number, default: 0 },
    nonReclaimable:   { type: Number, default: 0 },
  },

  submittedAt:    { type: Date },
  submittedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  hmrcReference:  { type: String },
  notes:          { type: String },
}, { timestamps: true });

vatReturnSchema.index({ store: 1, 'period.start': -1 });

module.exports = mongoose.model('VatReturn', vatReturnSchema);
