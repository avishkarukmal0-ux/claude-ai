'use strict';

const Staff = require('../models/Staff');
const ScanPattern = require('../models/ScanPattern');
const DiscountPattern = require('../models/DiscountPattern');
const LoneWorkerSession = require('../models/LoneWorkerSession');
const Incident = require('../models/Incident');
const AuditLog = require('../models/AuditLog');
const AppError = require('../utils/AppError');

let _io = null;

function setIo(ioInstance) {
  _io = ioInstance;
}

async function analyzeSaleForPatterns(sale) {
  try {
    const store = await require('../models/Store').findById(sale.store);
    if (!store) return;

    const { lpSettings } = store;
    const patterns = [];

    // Check rapid scanning
    const scanTimes = sale.items
      .filter((i) => i.scanTime)
      .map((i) => new Date(i.scanTime).getTime())
      .sort((a, b) => a - b);

    if (scanTimes.length >= (lpSettings.rapidScanMinItems || 5)) {
      const intervals = [];
      for (let i = 1; i < scanTimes.length; i++) {
        intervals.push((scanTimes[i] - scanTimes[i - 1]) / 1000);
      }
      const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;

      if (avgInterval < (lpSettings.rapidScanThreshold || 2)) {
        patterns.push({
          patternType: 'rapid_scan',
          severity: avgInterval < 0.5 ? 'critical' : avgInterval < 1 ? 'high' : 'medium',
          details: {
            itemCount: sale.items.length,
            scanDuration: (scanTimes[scanTimes.length - 1] - scanTimes[0]) / 1000,
            averageInterval: avgInterval,
          },
        });
      }
    }

    // Check quantity spikes
    for (const item of sale.items) {
      if (item.quantity > (lpSettings.quantitySpikeThreshold || 10)) {
        patterns.push({
          patternType: 'quantity_spike',
          severity: item.quantity > 20 ? 'high' : 'medium',
          details: {
            itemCount: item.quantity,
            suspiciousItems: [item.name],
          },
        });
      }
    }

    for (const pattern of patterns) {
      const doc = await ScanPattern.create({
        store: sale.store,
        staff: sale.staff,
        staffName: sale.staffName,
        sale: sale._id,
        receiptNumber: sale.receiptNumber,
        tillId: sale.tillId,
        ...pattern,
        detectedAt: new Date(),
      });

      if (_io) {
        _io.to(`store:${sale.store}`).emit('lp:pattern_detected', {
          type: pattern.patternType,
          severity: pattern.severity,
          staffName: sale.staffName,
          receiptNumber: sale.receiptNumber,
          tillId: sale.tillId,
          patternId: doc._id,
        });
      }
    }
  } catch (err) {
    console.error('LP pattern analysis error:', err.message);
  }
}

async function recordDiscountPattern(staffId, storeId, saleId, discounts) {
  try {
    if (!discounts || discounts.length === 0) return;

    const totalDiscountValue = discounts.reduce((s, d) => s + (d.amount || 0), 0);
    const staff = await Staff.findById(staffId);
    if (!staff) return;

    // Check if total discounts today are suspicious
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existing = await DiscountPattern.findOne({
      store: storeId,
      staff: staffId,
      'period.start': { $gte: todayStart },
    });

    if (existing) {
      existing.metrics.discountCount += discounts.length;
      existing.metrics.totalDiscountValue += totalDiscountValue;
      existing.samples.push({
        saleId,
        discountAmount: totalDiscountValue,
        occurredAt: new Date(),
      });
      await existing.save();
    }
  } catch (err) {
    console.error('Discount pattern record error:', err.message);
  }
}

async function checkStaffLimit(staffId, action, amount) {
  const staff = await Staff.findById(staffId);
  if (!staff) throw AppError.notFound('Staff');

  const counter = staff.dailyCounters[action + 's'];
  const limit = staff.dailyLimits[action + 'Limit'];

  if (counter && limit !== undefined) {
    if (counter.count >= limit) {
      throw AppError.limitExceeded(`Daily ${action} limit (${limit}) reached`);
    }
  }

  // Also check amount limits
  if (action === 'refund' && amount > staff.permissions.maxRefundAmount) {
    throw AppError.permissionDenied(`Refund amount exceeds your limit of £${staff.permissions.maxRefundAmount}`);
  }
}

async function incrementStaffCounter(staffId, action, amount) {
  const field = action + 's';
  await Staff.findByIdAndUpdate(staffId, {
    $inc: {
      [`dailyCounters.${field}.count`]: 1,
      [`dailyCounters.${field}.amount`]: amount || 0,
    },
    $set: { [`dailyCounters.${field}.lastReset`]: new Date() },
  });
}

async function triggerPanic(staffId, tillId, storeId, io) {
  const staff = await Staff.findById(staffId);

  await Incident.create({
    store: storeId,
    type: 'threat',
    severity: 'critical',
    reportedBy: staffId,
    reportedByName: staff ? staff.displayName : 'Unknown',
    description: `PANIC ALERT triggered from ${tillId}`,
    status: 'open',
    occurredAt: new Date(),
  });

  const ioInstance = io || _io;
  if (ioInstance) {
    ioInstance.to(`store:${storeId}`).emit('lp:panic', {
      staffName: staff ? staff.displayName : 'Unknown',
      tillId,
      timestamp: new Date(),
    });
  }
}

async function startLoneWorkerSession(staffId, storeId, tillId, settings) {
  const existing = await LoneWorkerSession.findOne({ store: storeId, staff: staffId, status: 'active' });
  if (existing) return existing;

  const staff = await Staff.findById(staffId);
  return LoneWorkerSession.create({
    store: storeId,
    staff: staffId,
    staffName: staff ? staff.displayName : '',
    tillId,
    status: 'active',
    settings: settings || {},
    startedAt: new Date(),
  });
}

async function loneWorkerCheckin(staffId, storeId) {
  const session = await LoneWorkerSession.findOne({ store: storeId, staff: staffId, status: 'active' });
  if (!session) throw AppError.notFound('Active lone worker session');

  session.checkIns.push({ time: new Date(), method: 'app' });
  await session.save();
  return session;
}

async function endLoneWorkerSession(staffId, storeId) {
  const session = await LoneWorkerSession.findOneAndUpdate(
    { store: storeId, staff: staffId, status: 'active' },
    { status: 'completed', endedAt: new Date() },
    { new: true }
  );
  return session;
}

module.exports = {
  setIo,
  analyzeSaleForPatterns,
  recordDiscountPattern,
  checkStaffLimit,
  incrementStaffCounter,
  triggerPanic,
  startLoneWorkerSession,
  loneWorkerCheckin,
  endLoneWorkerSession,
};
