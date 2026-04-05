const { Schema, model, Types: { ObjectId } } = require('mongoose');

const CustomerWatchlistSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  identifier: {
    type: { type: String, enum: ['phone', 'name', 'description', 'photo', 'loyalty_card'] },
    value: String,
    photoUrl: String,
  },
  reason: {
    type: String,
    enum: ['theft', 'fraud', 'abuse', 'banned', 'age_restricted', 'debt', 'other'],
    required: true,
  },
  alertLevel: {
    type: String,
    enum: ['watch', 'refuse_service', 'call_police'],
    default: 'watch',
  },
  description: String,
  incidents: [{ type: ObjectId, ref: 'Incident' }],
  addedBy: { type: ObjectId, ref: 'Staff' },
  expiresAt: Date,
  status: { type: String, enum: ['active', 'expired', 'removed'], default: 'active' },
}, { timestamps: true });

CustomerWatchlistSchema.index({ store: 1, status: 1 });

module.exports = model('CustomerWatchlist', CustomerWatchlistSchema);
