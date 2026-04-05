const { Schema, model, Types: { ObjectId } } = require('mongoose');

const ShiftHandoverSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  tillId: { type: String, required: true },
  outgoingStaff: { type: ObjectId, ref: 'Staff', required: true },
  outgoingStaffName: String,
  outgoingConfirmedAt: Date,
  outgoingPIN: String,
  incomingStaff: { type: ObjectId, ref: 'Staff', required: true },
  incomingStaffName: String,
  incomingConfirmedAt: Date,
  incomingPIN: String,
  expectedAmount: Number,
  declaredAmount: Number,
  variance: Number,
  status: {
    type: String,
    enum: ['pending', 'outgoing_confirmed', 'completed', 'disputed'],
    default: 'pending',
  },
  verificationType: { type: String, enum: ['quick_confirm', 'full_count'] },
  denominations: {
    notes: {
      fifty: { type: Number, default: 0 },
      twenty: { type: Number, default: 0 },
      ten: { type: Number, default: 0 },
      five: { type: Number, default: 0 },
    },
    coins: {
      twoPound: { type: Number, default: 0 },
      onePound: { type: Number, default: 0 },
      fiftyP: { type: Number, default: 0 },
      twentyP: { type: Number, default: 0 },
      tenP: { type: Number, default: 0 },
      fiveP: { type: Number, default: 0 },
      twoP: { type: Number, default: 0 },
      oneP: { type: Number, default: 0 },
    },
  },
  outgoingNotes: String,
  incomingNotes: String,
  disputeReason: String,
  disputeResolvedBy: { type: ObjectId, ref: 'Staff' },
  completedAt: Date,
}, { timestamps: true });

ShiftHandoverSchema.index({ store: 1, status: 1 });
ShiftHandoverSchema.index({ store: 1, tillId: 1, createdAt: -1 });

module.exports = model('ShiftHandover', ShiftHandoverSchema);
