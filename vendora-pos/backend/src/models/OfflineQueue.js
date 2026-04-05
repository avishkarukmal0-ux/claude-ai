const { Schema, model, Types: { ObjectId } } = require('mongoose');

const OfflineQueueSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  tillId: String,
  action: {
    type: String,
    enum: ['sale', 'refund', 'void', 'stock-adjustment', 'time-clock'],
    required: true,
  },
  payload: Schema.Types.Mixed,
  status: { type: String, enum: ['pending', 'syncing', 'synced', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  lastAttempt: Date,
  errorMessage: String,
  createdOfflineAt: { type: Date, required: true },
}, { timestamps: true });

OfflineQueueSchema.index({ store: 1, status: 1 });
OfflineQueueSchema.index({ store: 1, tillId: 1 });

module.exports = model('OfflineQueue', OfflineQueueSchema);
