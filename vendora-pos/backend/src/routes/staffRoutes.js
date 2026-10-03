'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Staff = require('../models/Staff');
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');
const config = require('../config');

// GET /api/staff
router.get('/', requireRole('manager'), async (req, res, next) => {
  try {
    const staff = await Staff.find({ store: req.storeId })
      .select('-pin -password -duressPin -twoFactorSecret')
      .sort({ displayName: 1 });
    res.json({ success: true, staff });
  } catch (err) {
    next(err);
  }
});

// GET /api/staff/:id
router.get('/:id', async (req, res, next) => {
  try {
    const staff = await Staff.findOne({ _id: req.params.id, store: req.storeId })
      .select('-pin -password -duressPin -twoFactorSecret');
    if (!staff) return next(AppError.notFound('Staff'));
    res.json({ success: true, staff });
  } catch (err) {
    next(err);
  }
});

// POST /api/staff
router.post('/', requireRole('manager'), async (req, res, next) => {
  try {
    const { pin, password, duressPin, ...rest } = req.body;
    const hashedPin = await bcrypt.hash(pin, config.bcrypt.rounds);
    const hashedDuress = duressPin ? await bcrypt.hash(duressPin, config.bcrypt.rounds) : undefined;
    const hashedPassword = password ? await bcrypt.hash(password, config.bcrypt.rounds) : undefined;

    const staff = await Staff.create({
      store: req.storeId,
      pin: hashedPin,
      duressPin: hashedDuress,
      password: hashedPassword,
      ...rest,
    });

    const staffObj = staff.toObject();
    delete staffObj.pin; delete staffObj.password; delete staffObj.duressPin;
    res.status(201).json({ success: true, staff: staffObj });
  } catch (err) {
    next(err);
  }
});

// PUT /api/staff/:id
router.put('/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const { pin, password, duressPin, ...rest } = req.body;
    if (pin) rest.pin = await bcrypt.hash(pin, config.bcrypt.rounds);
    if (password) rest.password = await bcrypt.hash(password, config.bcrypt.rounds);
    if (duressPin) rest.duressPin = await bcrypt.hash(duressPin, config.bcrypt.rounds);

    const staff = await Staff.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      rest,
      { new: true }
    ).select('-pin -password -duressPin -twoFactorSecret');
    if (!staff) return next(AppError.notFound('Staff'));
    res.json({ success: true, staff });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/staff/:id (deactivate)
router.delete('/:id', requireRole('owner'), async (req, res, next) => {
  try {
    const staff = await Staff.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      { status: 'terminated' },
      { new: true }
    );
    if (!staff) return next(AppError.notFound('Staff'));
    res.json({ success: true, message: 'Staff deactivated' });
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/:id/clock-in
router.post('/:id/clock-in', async (req, res, next) => {
  try {
    const { tillId } = req.body;
    const staff = await Staff.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      {
        'timeClock.isOnClock': true,
        'timeClock.currentShiftStart': new Date(),
        'timeClock.onBreak': false,
        $push: { shifts: { clockIn: new Date(), tillId: tillId || 'TILL-1' } },
      },
      { new: true }
    ).select('-pin -password -duressPin');
    if (!staff) return next(AppError.notFound('Staff'));
    res.json({ success: true, staff });
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/:id/clock-out
router.post('/:id/clock-out', async (req, res, next) => {
  try {
    const staff = await Staff.findOne({ _id: req.params.id, store: req.storeId });
    if (!staff) return next(AppError.notFound('Staff'));

    staff.timeClock.isOnClock = false;
    const lastShift = staff.shifts[staff.shifts.length - 1];
    if (lastShift && !lastShift.clockOut) {
      lastShift.clockOut = new Date();
    }
    await staff.save();
    res.json({ success: true, message: 'Clocked out' });
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/:id/break-start
router.post('/:id/break-start', async (req, res, next) => {
  try {
    await Staff.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      { 'timeClock.onBreak': true, 'timeClock.currentBreakStart': new Date() }
    );
    res.json({ success: true, message: 'Break started' });
  } catch (err) {
    next(err);
  }
});

// POST /api/staff/:id/break-end
router.post('/:id/break-end', async (req, res, next) => {
  try {
    const staff = await Staff.findOne({ _id: req.params.id, store: req.storeId });
    if (!staff) return next(AppError.notFound('Staff'));

    const breakStart = staff.timeClock.currentBreakStart;
    const breakMinutes = breakStart ? Math.round((Date.now() - breakStart.getTime()) / 60000) : 0;
    const lastShift = staff.shifts[staff.shifts.length - 1];
    if (lastShift) lastShift.breakMinutes = (lastShift.breakMinutes || 0) + breakMinutes;

    staff.timeClock.onBreak = false;
    staff.timeClock.currentBreakStart = undefined;
    await staff.save();
    res.json({ success: true, breakMinutes });
  } catch (err) {
    next(err);
  }
});

// GET /api/staff/:id/timecard
router.get('/:id/timecard', async (req, res, next) => {
  try {
    const staff = await Staff.findOne({ _id: req.params.id, store: req.storeId }).select('shifts displayName employeeId');
    if (!staff) return next(AppError.notFound('Staff'));
    const totalHours = staff.shifts.reduce((s, shift) => {
      if (shift.clockIn && shift.clockOut) {
        const worked = (shift.clockOut - shift.clockIn) / 3600000 - (shift.breakMinutes || 0) / 60;
        return s + Math.max(0, worked);
      }
      return s;
    }, 0);
    res.json({ success: true, staff, totalHours: Math.round(totalHours * 100) / 100 });
  } catch (err) {
    next(err);
  }
});

// GET /api/staff/:id/performance
router.get('/:id/performance', requireRole('manager'), async (req, res, next) => {
  try {
    const Sale = require('../models/Sale');
    const { from, to } = req.query;
    const query = { store: req.storeId, staff: req.params.id, status: 'completed', isTraining: false };
    if (from) query.completedAt = { $gte: new Date(from) };
    if (to) query.completedAt = { ...(query.completedAt || {}), $lte: new Date(to) };

    const sales = await Sale.find(query);
    const revenue = sales.reduce((s, sale) => s + (sale.total || 0), 0);
    res.json({
      success: true,
      performance: {
        transactionCount: sales.length,
        revenue,
        averageBasket: sales.length > 0 ? revenue / sales.length : 0,
        discountTotal: sales.reduce((s, sale) => s + (sale.discountTotal || 0), 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/staff/leaderboard — requireRole supervisor
router.get('/leaderboard', requireRole('supervisor'), async (req, res, next) => {
  try {
    const Sale = require('../models/Sale');
    const { period = 'today' } = req.query;

    const now = new Date();
    let startDate;
    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      // today
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const pipeline = [
      {
        $match: {
          store: req.storeId,
          status: 'completed',
          isTraining: { $ne: true },
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$staff',
          displayName: { $first: '$staffName' },
          totalSales: { $sum: '$total' },
          totalTransactions: { $sum: 1 },
          avgBasket: { $avg: '$total' },
        },
      },
      { $sort: { totalSales: -1 } },
    ];

    const results = await Sale.aggregate(pipeline);

    const leaderboard = results.map((entry, index) => ({
      staffId: entry._id,
      displayName: entry.displayName || 'Unknown',
      totalSales: Math.round((entry.totalSales || 0) * 100) / 100,
      totalTransactions: entry.totalTransactions || 0,
      averageBasket: Math.round((entry.avgBasket || 0) * 100) / 100,
      rank: index + 1,
    }));

    res.json({ success: true, leaderboard });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
