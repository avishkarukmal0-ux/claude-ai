const { Schema, model, Types: { ObjectId } } = require('mongoose');

// ActivePromotion is a lightweight runtime cache of currently active promotions
// rebuilt whenever promotions are saved/updated.
const ActivePromotionSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true, index: true },
  promotion: { type: ObjectId, ref: 'Promotion', required: true },
  name: String,
  type: String,
  applicableTo: Schema.Types.Mixed,
  params: Schema.Types.Mixed,
  autoApply: { type: Boolean, default: false },
  priority: { type: Number, default: 0 },
  stackable: { type: Boolean, default: false },
  expiresAt: Date,
}, { timestamps: true });

ActivePromotionSchema.index({ store: 1, autoApply: 1 });

module.exports = model('ActivePromotion', ActivePromotionSchema);
