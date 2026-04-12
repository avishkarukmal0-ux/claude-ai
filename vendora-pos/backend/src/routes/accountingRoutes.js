'use strict';

const express = require('express');
const router  = express.Router();
const AppError = require('../utils/AppError');
const { requireRole } = require('../middleware/permissions');

const VatReturn          = require('../models/VatReturn');
const PayrollRun         = require('../models/PayrollRun');
const Expense            = require('../models/Expense');
const AccountingSettings = require('../models/AccountingSettings');

const vatService        = require('../services/vatService');
const payrollService    = require('../services/payrollService');
const profitLossService = require('../services/profitLossService');
const { generatePayslipPDF } = require('../services/payslipGenerator');

// All accounting routes require at least supervisor
router.use(requireRole('supervisor'));

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const storeId = req.storeId;
    const now     = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [latestVat, latestPayroll, pl, expenseThisMonth, settings] = await Promise.all([
      VatReturn.findOne({ store: storeId }).sort({ 'period.start': -1 }).lean(),
      PayrollRun.findOne({ store: storeId }).sort({ 'period.start': -1 }).lean(),
      profitLossService.generatePL(storeId, startOfMonth, now),
      Expense.aggregate([
        { $match: { store: req.user.store, date: { $gte: startOfMonth, $lte: now } } },
        { $group: { _id: null, total: { $sum: '$netAmount' } } },
      ]),
      AccountingSettings.findOne({ store: storeId }).lean(),
    ]);

    res.json({
      success: true,
      pl,
      latestVatReturn: latestVat,
      latestPayroll:   latestPayroll,
      expensesMtd:     expenseThisMonth[0]?.total || 0,
      settings,
    });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// VAT RETURNS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/vat', async (req, res, next) => {
  try {
    const vatReturns = await vatService.listVatReturns(req.storeId);
    res.json({ success: true, vatReturns });
  } catch (err) {
    next(err);
  }
});

// Preview a VAT return for a given period (not saved)
router.post('/vat/preview', async (req, res, next) => {
  try {
    const { periodStart, periodEnd } = req.body;
    if (!periodStart || !periodEnd) throw new AppError('periodStart and periodEnd required', 400);

    const vatReturn = await vatService.calculateVatReturn(req.storeId, periodStart, periodEnd);
    res.json({ success: true, vatReturn });
  } catch (err) {
    next(err);
  }
});

// Save a VAT return as draft
router.post('/vat', async (req, res, next) => {
  try {
    const { periodStart, periodEnd } = req.body;
    if (!periodStart || !periodEnd) throw new AppError('periodStart and periodEnd required', 400);

    const vatReturn = await vatService.calculateVatReturn(req.storeId, periodStart, periodEnd);
    await vatReturn.save();
    res.status(201).json({ success: true, vatReturn });
  } catch (err) {
    next(err);
  }
});

router.get('/vat/:id', async (req, res, next) => {
  try {
    const vatReturn = await VatReturn.findOne({ _id: req.params.id, store: req.storeId }).lean();
    if (!vatReturn) throw new AppError('VAT return not found', 404);
    res.json({ success: true, vatReturn });
  } catch (err) {
    next(err);
  }
});

router.patch('/vat/:id', async (req, res, next) => {
  try {
    const allowed = ['status', 'hmrcReference', 'notes', 'submittedAt'];
    const update  = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (update.status === 'submitted' && !update.submittedAt) {
      update.submittedAt = new Date();
      update.submittedBy = req.user._id;
    }
    const vatReturn = await VatReturn.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      { $set: update },
      { new: true },
    );
    if (!vatReturn) throw new AppError('VAT return not found', 404);
    res.json({ success: true, vatReturn });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL
// ─────────────────────────────────────────────────────────────────────────────
router.get('/payroll', async (req, res, next) => {
  try {
    const runs = await PayrollRun.find({ store: req.storeId })
      .sort({ 'period.start': -1 })
      .limit(24)
      .lean();
    res.json({ success: true, runs });
  } catch (err) {
    next(err);
  }
});

router.post('/payroll/calculate', async (req, res, next) => {
  try {
    const { periodStart, periodEnd, frequency } = req.body;
    if (!periodStart || !periodEnd) throw new AppError('periodStart and periodEnd required', 400);

    const run = await payrollService.calculatePayroll(req.storeId, periodStart, periodEnd, frequency || 'monthly');
    res.json({ success: true, run });
  } catch (err) {
    next(err);
  }
});

router.post('/payroll', async (req, res, next) => {
  try {
    const { periodStart, periodEnd, frequency } = req.body;
    if (!periodStart || !periodEnd) throw new AppError('periodStart and periodEnd required', 400);

    const run = await payrollService.calculatePayroll(req.storeId, periodStart, periodEnd, frequency || 'monthly');
    await run.save();
    res.status(201).json({ success: true, run });
  } catch (err) {
    next(err);
  }
});

router.get('/payroll/:id', async (req, res, next) => {
  try {
    const run = await PayrollRun.findOne({ _id: req.params.id, store: req.storeId }).lean();
    if (!run) throw new AppError('Payroll run not found', 404);
    res.json({ success: true, run });
  } catch (err) {
    next(err);
  }
});

router.patch('/payroll/:id', async (req, res, next) => {
  try {
    const allowed = ['status', 'notes', 'approvedAt', 'rtiSubmitted', 'rtiReference'];
    const update  = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (req.body.status === 'approved') {
      update.approvedBy = req.user._id;
      update.approvedAt = new Date();
    }
    const run = await PayrollRun.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      { $set: update },
      { new: true },
    );
    if (!run) throw new AppError('Payroll run not found', 404);
    res.json({ success: true, run });
  } catch (err) {
    next(err);
  }
});

// Download payslip PDF for one employee in a run
router.get('/payroll/:runId/payslip/:staffId', async (req, res, next) => {
  try {
    const run = await PayrollRun.findOne({ _id: req.params.runId, store: req.storeId }).lean();
    if (!run) throw new AppError('Payroll run not found', 404);

    const employee = run.employees.find(e => e.staffId.toString() === req.params.staffId);
    if (!employee) throw new AppError('Employee not found in this payroll run', 404);

    const Store = require('../models/Store');
    const store = await Store.findById(req.storeId).lean();

    const pdf = await generatePayslipPDF(employee, run, store);

    const safeName = (employee.name || 'payslip').replace(/\s+/g, '_');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}_payslip.pdf"`,
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/expenses', async (req, res, next) => {
  try {
    const { from, to, category, page = 1, limit = 50 } = req.query;
    const filter = { store: req.storeId };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to)   filter.date.$lte = new Date(to);
    }
    if (category) filter.category = category;

    const [expenses, total] = await Promise.all([
      Expense.find(filter)
        .sort({ date: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit))
        .lean(),
      Expense.countDocuments(filter),
    ]);

    res.json({ success: true, expenses, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    next(err);
  }
});

router.post('/expenses', async (req, res, next) => {
  try {
    const { date, category, description, supplier, reference, netAmount, vatAmount, vatRate, vatReclaimable, paymentMethod, notes } = req.body;
    if (!date || !category || !description || netAmount == null) {
      throw new AppError('date, category, description, netAmount are required', 400);
    }
    const net   = parseFloat(netAmount) || 0;
    const vat   = parseFloat(vatAmount) || 0;
    const gross = net + vat;

    const expense = await Expense.create({
      store: req.storeId,
      date: new Date(date),
      category,
      description,
      supplier,
      reference,
      netAmount:   net,
      vatAmount:   vat,
      grossAmount: gross,
      vatRate:     parseFloat(vatRate) || 0,
      vatReclaimable: !!vatReclaimable,
      paymentMethod: paymentMethod || 'card',
      createdBy: req.user._id,
      notes,
    });
    res.status(201).json({ success: true, expense });
  } catch (err) {
    next(err);
  }
});

router.get('/expenses/:id', async (req, res, next) => {
  try {
    const expense = await Expense.findOne({ _id: req.params.id, store: req.storeId }).lean();
    if (!expense) throw new AppError('Expense not found', 404);
    res.json({ success: true, expense });
  } catch (err) {
    next(err);
  }
});

router.patch('/expenses/:id', async (req, res, next) => {
  try {
    const allowed = ['date', 'category', 'description', 'supplier', 'reference', 'netAmount', 'vatAmount', 'grossAmount', 'vatRate', 'vatReclaimable', 'paymentMethod', 'paymentStatus', 'notes'];
    const update  = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, store: req.storeId },
      { $set: update },
      { new: true },
    );
    if (!expense) throw new AppError('Expense not found', 404);
    res.json({ success: true, expense });
  } catch (err) {
    next(err);
  }
});

router.delete('/expenses/:id', async (req, res, next) => {
  try {
    await Expense.findOneAndDelete({ _id: req.params.id, store: req.storeId });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROFIT & LOSS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pl', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const now = new Date();
    const periodStart = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd   = to   ? new Date(to)   : now;

    const pl = await profitLossService.generatePL(req.storeId, periodStart, periodEnd);
    res.json({ success: true, pl });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/settings', async (req, res, next) => {
  try {
    let settings = await AccountingSettings.findOne({ store: req.storeId }).lean();
    if (!settings) {
      // Return sensible defaults if not configured yet
      settings = { store: req.storeId, vat: {}, payroll: {}, financialYearStart: { month: 4, day: 6 } };
    }
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

router.put('/settings', async (req, res, next) => {
  try {
    const settings = await AccountingSettings.findOneAndUpdate(
      { store: req.storeId },
      { $set: req.body },
      { new: true, upsert: true, runValidators: true },
    );
    res.json({ success: true, settings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
