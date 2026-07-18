'use strict';

const express = require('express');
const router = express.Router();
const AgeRefusal = require('../models/AgeRefusal');
const { requireRole } = require('../middleware/permissions');

// GET /api/challenge25/training-reminder (#24)
// Returns whether the current staff member needs a Challenge 25 training reminder today.
// Logic: show the reminder once per day on first login (check if already acknowledged today).
router.get('/training-reminder', async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const Staff = require('../models/Staff');
    const staff = await Staff.findById(req.user._id).select('challenge25LastReminder');

    const lastReminder = staff?.challenge25LastReminder;
    const needsReminder = !lastReminder || new Date(lastReminder) < today;

    res.json({ success: true, needsReminder, lastReminder });
  } catch (err) { next(err); }
});

// POST /api/challenge25/training-reminder/acknowledge (#24)
router.post('/training-reminder/acknowledge', async (req, res, next) => {
  try {
    const Staff = require('../models/Staff');
    await Staff.findByIdAndUpdate(req.user._id, { challenge25LastReminder: new Date() });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/challenge25/stats (#26)
router.get('/stats', requireRole('supervisor'), async (req, res, next) => {
  try {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 3600 * 1000);
    const monthAgo = new Date(now - 30 * 24 * 3600 * 1000);

    const [thisWeek, thisMonth, byStaffWeek, byReasonWeek, byStaffMonth] = await Promise.all([
      AgeRefusal.countDocuments({ store: req.storeId, occurredAt: { $gte: weekAgo } }),
      AgeRefusal.countDocuments({ store: req.storeId, occurredAt: { $gte: monthAgo } }),
      AgeRefusal.aggregate([
        { $match: { store: req.storeId, occurredAt: { $gte: weekAgo } } },
        { $group: { _id: '$staffName', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 10 },
      ]),
      AgeRefusal.aggregate([
        { $match: { store: req.storeId, occurredAt: { $gte: weekAgo } } },
        { $group: { _id: '$refusalReason', count: { $sum: 1 } } },
      ]),
      AgeRefusal.aggregate([
        { $match: { store: req.storeId, occurredAt: { $gte: monthAgo } } },
        { $group: { _id: '$staffName', count: { $sum: 1 } } },
        { $sort: { count: -1 } }, { $limit: 10 },
      ]),
    ]);

    res.json({
      success: true,
      thisWeek: { total: thisWeek, byStaff: byStaffWeek, byReason: byReasonWeek },
      thisMonth: { total: thisMonth, byStaff: byStaffMonth },
    });
  } catch (err) { next(err); }
});

// GET /api/challenge25/audit — HMRC/licensing compliance audit report (#25)
router.get('/audit', requireRole('supervisor'), async (req, res, next) => {
  try {
    const { from, to, page = 1, limit = 100 } = req.query;
    const query = { store: req.storeId };
    if (from || to) {
      query.occurredAt = {};
      if (from) query.occurredAt.$gte = new Date(from);
      if (to) query.occurredAt.$lte = new Date(to);
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [refusals, total] = await Promise.all([
      AgeRefusal.find(query)
        .sort({ occurredAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('staff', 'displayName employeeId'),
      AgeRefusal.countDocuments(query),
    ]);
    res.json({ success: true, refusals, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

module.exports = router;
