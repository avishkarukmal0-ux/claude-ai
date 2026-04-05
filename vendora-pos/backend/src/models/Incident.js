const { Schema, model, Types: { ObjectId } } = require('mongoose');

const IncidentSchema = new Schema({
  store: { type: ObjectId, ref: 'Store', required: true },
  type: {
    type: String,
    enum: ['theft', 'robbery', 'assault', 'threat', 'vandalism', 'fraud', 'suspicious_activity', 'accident', 'medical', 'other'],
    required: true,
  },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
  reportedBy: { type: ObjectId, ref: 'Staff', required: true },
  reportedByName: String,
  description: { type: String, required: true },
  personsInvolved: [{
    type: { type: String, enum: ['suspect', 'victim', 'witness', 'staff'] },
    name: String,
    description: String,
    contactInfo: String,
  }],
  timeline: [{
    time: Date,
    description: String,
    addedBy: { type: ObjectId, ref: 'Staff' },
  }],
  evidence: {
    cctvReference: String,
    photoUrls: [String],
  },
  authorities: {
    policeCalled: { type: Boolean, default: false },
    policeReference: String,
    ambulanceCalled: { type: Boolean, default: false },
  },
  status: { type: String, enum: ['open', 'investigating', 'resolved', 'closed'], default: 'open' },
  resolution: String,
  occurredAt: { type: Date, default: Date.now },
}, { timestamps: true });

IncidentSchema.index({ store: 1, status: 1 });
IncidentSchema.index({ store: 1, occurredAt: -1 });

module.exports = model('Incident', IncidentSchema);
