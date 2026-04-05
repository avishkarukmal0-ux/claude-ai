'use strict';
const ReportSchedule = require('../models/ReportSchedule');
const reportService = require('../services/reportService');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const scheduledReports = async () => {
  try {
    const now = new Date();
    const schedules = await ReportSchedule.find({ enabled: true });
    for (const schedule of schedules) {
      try {
        const [hour, minute] = (schedule.timeOfDay || '22:00').split(':').map(Number);
        if (now.getHours() !== hour || now.getMinutes() < minute || now.getMinutes() > minute + 5) continue;
        if (schedule.lastSent && (now - schedule.lastSent) < 10 * 60 * 1000) continue;
        const data = await reportService.getDailySummary(schedule.store, now.toISOString().split('T')[0]);
        for (const email of schedule.recipients || []) {
          await emailService.send({ to: email, subject: `Vendora Report: ${schedule.reportType}`, html: `<pre>${JSON.stringify(data, null, 2)}</pre>` });
        }
        schedule.lastSent = now;
        await schedule.save();
        logger.info(`Sent scheduled report ${schedule.reportType} to ${schedule.recipients}`);
      } catch (err) { logger.error(`Schedule ${schedule._id} error:`, err.message); }
    }
  } catch (err) { logger.error('Scheduled reports job error:', err.message); }
};
module.exports = { scheduledReports };
