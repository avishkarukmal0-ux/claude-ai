const { Schema, model, Types: { ObjectId } } = require('mongoose');

const TrainingSessionSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  staff: { type: ObjectId, ref: 'Staff', required: true },
  staffName: String,
  tillId: { type: String, required: true },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  transactionCount: { type: Number, default: 0 },
  totalValue: { type: Number, default: 0 },
  startedAt: { type: Date, default: Date.now },
  endedAt: Date,
}, { timestamps: true });

TrainingSessionSchema.index({ store: 1, tillId: 1, status: 1 });

module.exports = model('TrainingSession', TrainingSessionSchema);
