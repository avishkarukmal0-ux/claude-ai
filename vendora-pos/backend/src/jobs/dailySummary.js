'use strict';

// Nightly owner summary: at each store's configured close time (in its own
// timezone) build the "shop closed fine" recap and deliver it (WhatsApp for
// now). Runs every minute; an exact HH:mm match + the Notification dedupeKey
// make it fire exactly once per store per day, restart-safe.

const Store = require('../models/Store');
const ownerSummaryService = require('../services/ownerSummaryService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

// Dependency-free "now" in a timezone via Intl.
function hhmmIn(tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}
function dateKeyIn(tz) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const dailySummary = async () => {
  const stores = await Store.find({ isActive: true, 'ownerSummary.enabled': true });
  for (const store of stores) {
    try {
      const cfg = store.ownerSummary || {};
      const tz = store.timezone || 'Europe/London';

      // Fire only in the matching minute.
      if (hhmmIn(tz) !== (cfg.sendAt || '21:00')) continue;

      const channel = cfg.channel || 'whatsapp';
      if (channel !== 'whatsapp') {
        logger.warn(`Store ${store._id} daily summary channel '${channel}' not supported yet — skipping`);
        continue;
      }
      if (!cfg.whatsappTo) {
        logger.warn(`Store ${store._id} daily summary enabled but no whatsappTo set — skipping`);
        continue;
      }

      const dateKey = dateKeyIn(tz);
      const summary = await ownerSummaryService.buildOwnerSummary(store._id, dateKey);
      const result = await notificationService.deliver({
        store: store._id,
        type: 'daily_summary',
        channel: 'whatsapp',
        recipient: cfg.whatsappTo,
        text: summary.shareText,
        dedupeKey: `daily_summary:whatsapp:${store._id}:${dateKey}`,
      });

      if (result.sent) logger.info(`Daily summary sent for store ${store._id} (${dateKey})`);
    } catch (err) {
      logger.error(`Daily summary for store ${store._id} failed: ${err.message}`);
    }
  }
};

module.exports = { dailySummary };
