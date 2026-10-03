'use strict';
const mongoose = require('mongoose');

const employeePaySchema = new mongoose.Schema({
  staffId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Staff', required: true },
  name:         { type: String, required: true },
  employeeNumber: { type: String },

  // Hours
  hoursWorked:  { type: Number, default: 0 },
  hourlyRate:   { type: Number, default: 0 },

  // Gross
  basicPay:     { type: Number, default: 0 }, // hoursWorked * hourlyRate
  overtimePay:  { type: Number, default: 0 },
  bonus:        { type: Number, default: 0 },
  grossPay:     { type: Number, default: 0 }, // basicPay + overtimePay + bonus

  // Tax calculations (UK 2025/26)
  taxCode:      { type: String, default: '1257L' },
  taxableIncome: { type: Number, default: 0 }, // grossPay - personal allowance portion
  incomeTax:    { type: Number, default: 0 },   // PAYE
  employeeNI:   { type: Number, default: 0 },   // Employee NI Class 1
  employerNI:   { type: Number, default: 0 },   // Employer NI Class 1
  studentLoan:  { type: Number, default: 0 },   // Plan 1/2/4
  pensionEmployee: { type: Number, default: 0 },// AE pension deduction
  pensionEmployer: { type: Number, default: 0 },// Employer pension contribution

  // Net
  totalDeductions: { type: Number, default: 0 }, // incomeTax + employeeNI + studentLoan + pensionEmployee
  netPay:          { type: Number, default: 0 },  // grossPay - totalDeductions

  // NMW compliance
  nmwRate:         { type: Number, default: 12.21 }, // NMW for 21+ (FY2025/26)
  nmwCompliant:    { type: Boolean, default: true },

  // Payment
  paymentMethod:   { type: String, enum: ['bacs', 'cash', 'cheque'], default: 'bacs' },
  bankSortCode:    { type: String },
  bankAccount:     { type: String },
}, { _id: false });

const payrollRunSchema = new mongoose.Schema({
  store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },

  period: {
    start:     { type: Date, required: true },
    end:       { type: Date, required: true },
    frequency: { type: String, enum: ['weekly', 'fortnightly', 'monthly'], default: 'monthly' },
    payDate:   { type: Date, required: true },
    taxYear:   { type: String }, // e.g. "2025/26"
    taxPeriod: { type: Number }, // 1-12 for monthly, 1-52 weekly
  },

  employees: [employeePaySchema],

  // Run totals
  totals: {
    grossPay:        { type: Number, default: 0 },
    incomeTax:       { type: Number, default: 0 },
    employeeNI:      { type: Number, default: 0 },
    employerNI:      { type: Number, default: 0 },
    pensionEmployee: { type: Number, default: 0 },
    pensionEmployer: { type: Number, default: 0 },
    studentLoan:     { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    netPay:          { type: Number, default: 0 },
    employerCost:    { type: Number, default: 0 }, // grossPay + employerNI + pensionEmployer
  },

  status: { type: String, enum: ['draft', 'approved', 'paid', 'submitted_rti'], default: 'draft' },

  // RTI (Real Time Information) HMRC submission
  rtiSubmitted:    { type: Boolean, default: false },
  rtiSubmittedAt:  { type: Date },
  rtiReference:    { type: String },

  approvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'Staff' },
  approvedAt:  { type: Date },
  notes:       { type: String },
}, { timestamps: true });

payrollRunSchema.index({ store: 1, 'period.start': -1 });

module.exports = mongoose.model('PayrollRun', payrollRunSchema);
