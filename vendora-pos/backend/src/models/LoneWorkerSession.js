const { Schema, model, Types: { ObjectId } } = require('mongoose');

const LoneWorkerSessionSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  staff: { type: ObjectId, ref: 'Staff', required: true },
  staffName: String,
  tillId: String,
  status: { type: String, enum: ['active', 'completed', 'alert', 'emergency'], default: 'active' },
  checkIns: [{
    time: { type: Date, default: Date.now },
    method: { type: String, enum: ['app', 'pin', 'automatic'], default: 'app' },
    response: String,
  }],
  settings: {
    checkInInterval: { type: Number, default: 30 },
    alertAfterMissed: { type: Number, default: 2 },
    emergencyContacts: [{ name: String, phone: String, email: String }],
  },
  alerts: [{
    type: { type: String, enum: ['missed_checkin', 'panic', 'duress'] },
    message: String,
    sentAt: Date,
    sentTo: [String],
  }],
  startedAt: { type: Date, default: Date.now },
  endedAt: Date,
}, { timestamps: true });

LoneWorkerSessionSchema.index({ store: 1, status: 1 });

module.exports = model('LoneWorkerSession', LoneWorkerSessionSchema);
