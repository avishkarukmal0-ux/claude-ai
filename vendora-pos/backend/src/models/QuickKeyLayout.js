const { Schema, model, Types: { ObjectId } } = require('mongoose');

const QuickKeyLayoutSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  name: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  columns: { type: Number, default: 4 },
  rows: { type: Number, default: 4 },
  createdBy: { type: ObjectId, ref: 'Staff' },
}, { timestamps: true });

QuickKeyLayoutSchema.index({ store: 1, isDefault: 1 });

module.exports = model('QuickKeyLayout', QuickKeyLayoutSchema);
