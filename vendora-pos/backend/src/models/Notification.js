'use strict';

const { Schema, model } = require('mongoose');

// Outbox / delivery log for owner-facing notifications (e.g. the nightly
// "shop closed fine" summary). One row per delivery attempt. The unique
// `dedupeKey` is the idempotency guard — a second attempt for the same
// store+type+day fails to insert, so we never double-send even if the
// scheduler runs twice or the server restarts mid-minute.
const NotificationSchema = new Schema({
  store:     { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
  type:      { type: String, required: true },   // 'daily_summary'
  channel:   { type: String, required: true },   // 'whatsapp' | 'sms' | 'email'
  recipient: String,                             // phone / email the message went to
  text:      String,                             // exact body sent
  status:    { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'pending' },
  providerId: String,                            // e.g. Twilio message SID
  error:     String,
  dedupeKey: { type: String, unique: true, sparse: true },
  sentAt:    Date,
}, { timestamps: true });

NotificationSchema.index({ store: 1, type: 1, createdAt: -1 });

module.exports = model('Notification', NotificationSchema);
