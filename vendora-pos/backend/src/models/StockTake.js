const { Schema, model, Types: { ObjectId } } = require('mongoose');

const StockTakeSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  reference: String,
  type: { type: String, enum: ['full', 'category', 'spot'], default: 'full' },
  categories: [String],
  status: {
    type: String,
    enum: ['draft', 'in_progress', 'counting', 'variance_review', 'applied', 'cancelled'],
    default: 'draft',
  },
  createdBy: { type: ObjectId, ref: 'Staff' },
  createdByName: String,
  startedAt: Date,
  completedAt: Date,
  appliedAt: Date,
  appliedBy: { type: ObjectId, ref: 'Staff' },
  summary: {
    totalProducts: { type: Number, default: 0 },
    countedProducts: { type: Number, default: 0 },
    variances: { type: Number, default: 0 },
    totalVarianceValue: { type: Number, default: 0 },
    positiveVariances: { type: Number, default: 0 },
    negativeVariances: { type: Number, default: 0 },
  },
  notes: String,
}, { timestamps: true });

StockTakeSchema.index({ store: 1, status: 1 });

module.exports = model('StockTake', StockTakeSchema);
