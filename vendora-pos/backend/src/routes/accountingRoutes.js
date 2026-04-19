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
    const { periodStart, periodEnd, frequency, employees } = req.body;
    if (!periodStart || !periodEnd) throw new AppError('periodStart and periodEnd required', 400);

    let run;
    if (employees && Array.isArray(employees) && employees.length > 0) {
      // Manual mode: use pre-calculated employee data from frontend
      const freq = frequency || 'monthly';
      const r2 = (n) => Math.round((n || 0) * 100) / 100;
      const totals = employees.reduce((acc, e) => {
        acc.grossPay        += e.grossPay || 0;
        acc.incomeTax       += e.incomeTax || 0;
        acc.employeeNI      += e.employeeNI || 0;
        acc.employerNI      += e.employerNI || 0;
        acc.pensionEmployee += e.pensionEmployee || 0;
        acc.pensionEmployer += e.pensionEmployer || 0;
        acc.studentLoan     += e.studentLoan || 0;
        acc.totalDeductions += e.totalDeductions || 0;
        acc.netPay          += e.netPay || 0;
        return acc;
      }, { grossPay:0, incomeTax:0, employeeNI:0, employerNI:0, pensionEmployee:0, pensionEmployer:0, studentLoan:0, totalDeductions:0, netPay:0 });
      Object.keys(totals).forEach(k => { totals[k] = r2(totals[k]); });
      totals.employerCost = r2(totals.grossPay + totals.employerNI + totals.pensionEmployer);
      const start = new Date(periodStart);
      const end   = new Date(periodEnd);
      const y = start.getFullYear();
      const taxYear = start < new Date(y, 3, 6)
        ? `${y - 1}/${String(y).slice(2)}`
        : `${y}/${String(y + 1).slice(2)}`;
      run = new PayrollRun({
        store: req.storeId,
        period: {
          start, end, frequency: freq,
          payDate: end,
          taxYear,
          taxPeriod: start.getMonth() < 3 ? start.getMonth() + 10 : start.getMonth() - 2,
        },
        employees,
        totals,
        status: 'draft',
      });
    } else {
      run = await payrollService.calculatePayroll(req.storeId, periodStart, periodEnd, frequency || 'monthly');
    }
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

// Update employee in payroll run
router.put('/payroll/:runId/employee/:staffId', async (req, res, next) => {
  try {
    const run = await PayrollRun.findOne({ _id: req.params.runId, store: req.storeId });
    if (!run) throw new AppError('Payroll run not found', 404);

    const empIdx = run.employees.findIndex(e => e.staffId.toString() === req.params.staffId);
    if (empIdx === -1) throw new AppError('Employee not found in this payroll run', 404);

    const { hoursWorked, overtimeHours = 0, hourlyRate, taxCode, niCategory, paymentMethod, notes } = req.body;
    if (hoursWorked === undefined || hourlyRate === undefined) {
      throw new AppError('hoursWorked and hourlyRate required', 400);
    }

    const emp = run.employees[empIdx];
    emp.hoursWorked = hoursWorked;
    emp.overtimeHours = overtimeHours || 0;
    emp.hourlyRate = hourlyRate;
    emp.taxCode = taxCode || emp.taxCode;
    emp.niCategory = niCategory || emp.niCategory;
    emp.paymentMethod = paymentMethod || emp.paymentMethod;
    emp.notes = notes || '';

    // Recalculate pay using payroll service
    const updated = await payrollService.recalculateEmployee(emp, run.period.frequency);
    run.employees[empIdx] = updated;

    // Recalculate totals
    const newTotals = { grossPay: 0, incomeTax: 0, employeeNI: 0, employerNI: 0, pensionEmployee: 0, pensionEmployer: 0, studentLoan: 0, totalDeductions: 0, netPay: 0, employerCost: 0 };
    run.employees.forEach(e => {
      newTotals.grossPay += e.grossPay || 0;
      newTotals.incomeTax += e.incomeTax || 0;
      newTotals.employeeNI += e.employeeNI || 0;
      newTotals.employerNI += e.employerNI || 0;
      newTotals.pensionEmployee += e.pensionEmployee || 0;
      newTotals.pensionEmployer += e.pensionEmployer || 0;
      newTotals.studentLoan += e.studentLoan || 0;
      newTotals.totalDeductions += e.totalDeductions || 0;
      newTotals.netPay += e.netPay || 0;
      newTotals.employerCost += (e.grossPay || 0) + (e.employerNI || 0) + (e.pensionEmployer || 0);
    });
    run.totals = newTotals;

    await run.save();
    res.json({ success: true, employee: updated, totals: newTotals });
  } catch (err) {
    next(err);
  }
});

// Remove employee from payroll run
router.delete('/payroll/:runId/employee/:staffId', async (req, res, next) => {
  try {
    const run = await PayrollRun.findOne({ _id: req.params.runId, store: req.storeId });
    if (!run) throw new AppError('Payroll run not found', 404);

    const empIdx = run.employees.findIndex(e => e.staffId.toString() === req.params.staffId);
    if (empIdx === -1) throw new AppError('Employee not found in this payroll run', 404);

    const removed = run.employees.splice(empIdx, 1)[0];

    // Recalculate totals
    const newTotals = { grossPay: 0, incomeTax: 0, employeeNI: 0, employerNI: 0, pensionEmployee: 0, pensionEmployer: 0, studentLoan: 0, totalDeductions: 0, netPay: 0, employerCost: 0 };
    run.employees.forEach(e => {
      newTotals.grossPay += e.grossPay || 0;
      newTotals.incomeTax += e.incomeTax || 0;
      newTotals.employeeNI += e.employeeNI || 0;
      newTotals.employerNI += e.employerNI || 0;
      newTotals.pensionEmployee += e.pensionEmployee || 0;
      newTotals.pensionEmployer += e.pensionEmployer || 0;
      newTotals.studentLoan += e.studentLoan || 0;
      newTotals.totalDeductions += e.totalDeductions || 0;
      newTotals.netPay += e.netPay || 0;
      newTotals.employerCost += (e.grossPay || 0) + (e.employerNI || 0) + (e.pensionEmployer || 0);
    });
    run.totals = newTotals;

    await run.save();
    res.json({ success: true, removed: removed.name, totals: newTotals });
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
