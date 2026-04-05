const { Schema, model, Types: { ObjectId } } = require('mongoose');

const ReportScheduleSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  reportType: {
    type: String,
    enum: ['daily_summary', 'weekly_summary', 'stock_alerts', 'staff_hours', 'sales_by_category', 'low_stock'],
    required: true,
  },
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
  dayOfWeek: { type: Number, min: 0, max: 6 },
  timeOfDay: { type: String, default: '22:00' },
  recipients: [String],
  enabled: { type: Boolean, default: true },
  lastSent: Date,
}, { timestamps: true });

ReportScheduleSchema.index({ store: 1, enabled: 1 });

module.exports = model('ReportSchedule', ReportScheduleSchema);
