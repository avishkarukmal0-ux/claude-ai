'use strict';

const { Schema, model, Types: { ObjectId } } = require('mongoose');

const CollectionOrderSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  orderNumber: { type: String, unique: true },
  customerName: { type: String, required: true },
  customerPhone: String,
  items: [{
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unitPrice: Number,
    lineTotal: Number,
  }],
  total: Number,
  status: {
    type: String,
    enum: ['pending', 'ready', 'collected', 'cancelled'],
    default: 'pending',
  },
  notes: String,
  requestedTime: Date,
  preparedBy: { type: ObjectId, ref: 'Staff' },
  collectedBy: { type: ObjectId, ref: 'Staff' },
  collectedAt: Date,
  linkedSaleId: { type: ObjectId, ref: 'Sale' },
}, { timestamps: true });

CollectionOrderSchema.index({ store: 1, status: 1, createdAt: -1 });

CollectionOrderSchema.pre('save', async function (next) {
  if (this.orderNumber) return next();

  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const count = await this.constructor.countDocuments({
      store: this.store,
      createdAt: { $gte: startOfDay, $lt: endOfDay },
    });

    const counter = String(count + 1).padStart(4, '0');
    this.orderNumber = `CC-${dateStr}-${counter}`;
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = model('CollectionOrder', CollectionOrderSchema);
