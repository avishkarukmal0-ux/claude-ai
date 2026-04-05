const { Schema, model, Types: { ObjectId } } = require('mongoose');

const StaffScheduleSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  staff: { type: ObjectId, ref: 'Staff', required: true },
  staffName: String,
  weekStarting: { type: Date, required: true },
  shifts: [{
    day: { type: Number, min: 0, max: 6 },
    startTime: String,
    endTime: String,
    tillId: String,
    notes: String,
    published: { type: Boolean, default: false },
  }],
  publishedAt: Date,
  publishedBy: { type: ObjectId, ref: 'Staff' },
  totalHours: Number,
}, { timestamps: true });

StaffScheduleSchema.index({ store: 1, weekStarting: 1 });
StaffScheduleSchema.index({ store: 1, staff: 1, weekStarting: 1 });

module.exports = model('StaffSchedule', StaffScheduleSchema);
