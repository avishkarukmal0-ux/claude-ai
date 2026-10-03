'use strict';
const express = require('express');
const router = express.Router();
const StaffSchedule = require('../models/StaffSchedule');
const { requireRole } = require('../middleware/permissions');
const AppError = require('../utils/AppError');

// Helper: get Monday of the week containing `date`
function getWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// GET /schedule/week?weekStart=ISO_DATE
// Returns shifts grouped by staff for the given week
router.get('/week', async (req, res, next) => {
  try {
    const weekStart = req.query.weekStart
      ? getWeekMonday(new Date(req.query.weekStart))
      : getWeekMonday(new Date());

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const schedules = await StaffSchedule.find({
      store: req.storeId,
      weekStarting: { $gte: weekStart, $lt: weekEnd },
    }).populate('staff', 'displayName role');

    // Transform to frontend format: [{ staffId, staffName, shifts: [null|{start,end}] × 7 }]
    const byStaff = {};
    for (const doc of schedules) {
      const staffId = (doc.staff?._id || doc.staff).toString();
      const staffName = doc.staff?.displayName || doc.staffName || 'Unknown';
      if (!byStaff[staffId]) {
        byStaff[staffId] = { staffId, staffName, shifts: Array(7).fill(null) };
      }
      for (const shift of doc.shifts) {
        const idx = typeof shift.day === 'number' ? shift.day : null;
        if (idx !== null && idx >= 0 && idx <= 6) {
          byStaff[staffId].shifts[idx] = {
            start: shift.startTime,
            end: shift.endTime,
            notes: shift.notes || null,
          };
        }
      }
    }

    res.json({
      success: true,
      shifts: Object.values(byStaff),
      weekStart,
      weekEnd,
    });
  } catch (err) { next(err); }
});

// POST /schedule/shift — add or replace a shift for a staff member on a given date
router.post('/shift', requireRole('manager'), async (req, res, next) => {
  try {
    const { staffId, date, startTime, endTime, notes, tillId } = req.body;
    if (!staffId || !date || !startTime || !endTime) {
      return next(AppError.validationError('staffId, date, startTime, endTime are required'));
    }

    const shiftDate = new Date(date);
    const dow = shiftDate.getDay(); // 0=Sun
    const dayIndex = dow === 0 ? 6 : dow - 1; // 0=Mon … 6=Sun
    const weekStart = getWeekMonday(shiftDate);

    let schedule = await StaffSchedule.findOne({
      store: req.storeId,
      staff: staffId,
      weekStarting: weekStart,
    });

    if (!schedule) {
      schedule = new StaffSchedule({
        store: req.storeId,
        staff: staffId,
        weekStarting: weekStart,
        shifts: [],
      });
    }

    // Replace any existing shift on same day
    schedule.shifts = schedule.shifts.filter(s => s.day !== dayIndex);
    schedule.shifts.push({ day: dayIndex, startTime, endTime, notes, tillId });

    // Recalculate total hours
    let totalMins = 0;
    for (const s of schedule.shifts) {
      const [sh, sm] = (s.startTime || '0:0').split(':').map(Number);
      const [eh, em] = (s.endTime || '0:0').split(':').map(Number);
      totalMins += (eh * 60 + em) - (sh * 60 + sm);
    }
    schedule.totalHours = Math.round((totalMins / 60) * 10) / 10;

    await schedule.save();
    res.status(201).json({ success: true, schedule });
  } catch (err) { next(err); }
});

// PUT /schedule/shift/:id — update a specific shift subdocument
router.put('/shift/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const schedule = await StaffSchedule.findOne({
      store: req.storeId,
      'shifts._id': req.params.id,
    });
    if (!schedule) return next(AppError.notFound('Shift'));

    const shift = schedule.shifts.id(req.params.id);
    const { startTime, endTime, notes, tillId } = req.body;
    if (startTime) shift.startTime = startTime;
    if (endTime) shift.endTime = endTime;
    if (notes !== undefined) shift.notes = notes;
    if (tillId !== undefined) shift.tillId = tillId;

    await schedule.save();
    res.json({ success: true, shift });
  } catch (err) { next(err); }
});

// DELETE /schedule/shift/:id — remove a shift subdocument
router.delete('/shift/:id', requireRole('manager'), async (req, res, next) => {
  try {
    const schedule = await StaffSchedule.findOne({
      store: req.storeId,
      'shifts._id': req.params.id,
    });
    if (!schedule) return next(AppError.notFound('Shift'));

    schedule.shifts.pull(req.params.id);
    await schedule.save();
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /schedule/publish — publish a rota (mark shifts as published)
router.post('/publish', requireRole('manager'), async (req, res, next) => {
  try {
    const { scheduleIds } = req.body;
    if (!scheduleIds?.length) return next(AppError.validationError('scheduleIds required'));
    await StaffSchedule.updateMany(
      { _id: { $in: scheduleIds }, store: req.storeId },
      { publishedAt: new Date(), publishedBy: req.user._id, 'shifts.$[].published': true }
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /schedule/my — staff member's own upcoming schedules
router.get('/my', async (req, res, next) => {
  try {
    const schedules = await StaffSchedule.find({ store: req.storeId, staff: req.user._id })
      .sort({ weekStarting: -1 }).limit(4);
    res.json({ success: true, schedules });
  } catch (err) { next(err); }
});

// GET /schedule/ — all schedules for store (supervisor+)
router.get('/', requireRole('supervisor'), async (req, res, next) => {
  try {
    const schedules = await StaffSchedule.find({ store: req.storeId })
      .populate('staff', 'displayName role');
    res.json({ success: true, schedules });
  } catch (err) { next(err); }
});

// POST /schedule/ — create a schedule document directly
router.post('/', requireRole('manager'), async (req, res, next) => {
  try {
    const s = await StaffSchedule.create({ store: req.storeId, ...req.body });
    res.status(201).json({ success: true, schedule: s });
  } catch (err) { next(err); }
});

module.exports = router;
