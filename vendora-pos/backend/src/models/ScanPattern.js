const { Schema, model, Types: { ObjectId } } = require('mongoose');

const ScanPatternSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  staff: { type: ObjectId, ref: 'Staff', required: true },
  staffName: String,
  sale: { type: ObjectId, ref: 'Sale' },
  receiptNumber: String,
  tillId: String,
  patternType: {
    type: String,
    enum: ['rapid_scan', 'quantity_spike', 'void_after_tender', 'discount_abuse', 'sweethearting', 'pass_around'],
    required: true,
  },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
  details: {
    itemCount: Number,
    scanDuration: Number,
    averageInterval: Number,
    suspiciousItems: [String],
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'escalated', 'dismissed', 'confirmed'],
    default: 'pending',
  },
  cctvReference: String,
  detectedAt: { type: Date, default: Date.now },
  reviewedBy: { type: ObjectId, ref: 'Staff' },
  reviewedAt: Date,
  reviewNotes: String,
}, { timestamps: true });

ScanPatternSchema.index({ store: 1, status: 1 });
ScanPatternSchema.index({ store: 1, staff: 1 });
ScanPatternSchema.index({ store: 1, detectedAt: -1 });

module.exports = model('ScanPattern', ScanPatternSchema);
