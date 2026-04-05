const { Schema, model, Types: { ObjectId } } = require('mongoose');

const AuditLogSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  staff: { type: ObjectId, ref: 'Staff' },
  staffName: String,
  action: { type: String, required: true },
  entityType: String,
  entityId: ObjectId,
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  ipAddress: String,
  userAgent: String,
  occurredAt: { type: Date, default: Date.now },
}, { timestamps: true });

AuditLogSchema.index({ store: 1, occurredAt: -1 });
AuditLogSchema.index({ store: 1, action: 1 });
AuditLogSchema.index({ store: 1, entityType: 1, entityId: 1 });

module.exports = model('AuditLog', AuditLogSchema);
