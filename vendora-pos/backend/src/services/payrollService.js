'use strict';

const Staff = require('../models/Staff');
const PayrollRun = require('../models/PayrollRun');

// UK 2025/26 tax constants
const TAX = {
  personalAllowance: 12570,
  basicRate:   0.20,  // up to £50,270
  higherRate:  0.40,  // £50,271 – £125,140
  addRate:     0.45,  // above £125,140
  basicBand:   50270,
  higherBand:  125140,

  // NI thresholds (employee Class 1) — weekly figures × 52
  niPrimaryThreshold:  12570,  // annual (£242/week)
  niUpperEarnings:     50270,  // annual (£967/week)
  niRatePrimary: 0.08,         // 8% between PT and UEL
  niRateUpper:   0.02,         // 2% above UEL

  // Employer NI
  niSecondaryThreshold: 9100,  // annual (£175/week)
  niRateEmployer: 0.138,       // 13.8% above ST

  // Pension auto-enrolment qualifying earnings band
  pensionLower: 6240,
  pensionUpper: 50270,

  // NMW 2025/26
  nmwAdult: 12.21, // 21+
};

/**
 * Calculate annual PAYE income tax (simplified, 1257L tax code).
 * @param {number} annualGross - annual gross pay
 * @returns {number} annual tax
 */
function calcAnnualTax(annualGross) {
  const taxable = Math.max(0, annualGross - TAX.personalAllowance);
  if (taxable <= 0) return 0;

  const basicAmount  = Math.min(taxable, TAX.basicBand - TAX.personalAllowance);
  const higherAmount = taxable > (TAX.basicBand - TAX.personalAllowance)
    ? Math.min(taxable - (TAX.basicBand - TAX.personalAllowance), TAX.higherBand - TAX.basicBand)
    : 0;
  const addAmount    = taxable > (TAX.higherBand - TAX.personalAllowance)
    ? taxable - (TAX.higherBand - TAX.personalAllowance)
    : 0;

  return (basicAmount * TAX.basicRate) + (higherAmount * TAX.higherRate) + (addAmount * TAX.addRate);
}

/**
 * Calculate annual employee NI (Class 1).
 */
function calcAnnualEmployeeNI(annualGross) {
  if (annualGross <= TAX.niPrimaryThreshold) return 0;
  const primary = Math.min(annualGross, TAX.niUpperEarnings) - TAX.niPrimaryThreshold;
  const upper   = Math.max(0, annualGross - TAX.niUpperEarnings);
  return (primary * TAX.niRatePrimary) + (upper * TAX.niRateUpper);
}

/**
 * Calculate annual employer NI (Class 1).
 */
function calcAnnualEmployerNI(annualGross) {
  if (annualGross <= TAX.niSecondaryThreshold) return 0;
  return (annualGross - TAX.niSecondaryThreshold) * TAX.niRateEmployer;
}

const r2 = (n) => Math.round((n || 0) * 100) / 100;

/**
 * Scale annual figure down to a pay period.
 * @param {number} annual
 * @param {'weekly'|'fortnightly'|'monthly'} freq
 */
function periodFraction(annual, freq) {
  if (freq === 'weekly')       return annual / 52;
  if (freq === 'fortnightly')  return annual / 26;
  return annual / 12; // monthly
}

/**
 * Calculate payroll for a given period.
 * Uses Staff.shifts[] to sum actual hours worked; falls back to payroll.weeklyHours if no shift data.
 */
async function calculatePayroll(storeId, periodStart, periodEnd, frequency = 'monthly') {
  const start = new Date(periodStart);
  const end   = new Date(periodEnd);

  const staffList = await Staff.find({
    store: storeId,
    status: 'active',
    'payroll.hourlyRate': { $exists: true, $gt: 0 },
  }).lean();

  const employees = [];

  for (const staff of staffList) {
    const hourlyRate = staff.payroll?.hourlyRate || 0;
    if (!hourlyRate) continue;

    // Sum hours from shift records in this period
    let hoursWorked = 0;
    for (const shift of (staff.shifts || [])) {
      const clockIn  = shift.clockIn  ? new Date(shift.clockIn)  : null;
      const clockOut = shift.clockOut ? new Date(shift.clockOut) : null;
      if (!clockIn || !clockOut) continue;
      if (clockOut < start || clockIn > end) continue;

      const ms      = clockOut - clockIn;
      const hours   = ms / 3_600_000;
      const breaks  = (shift.breakMinutes || 0) / 60;
      hoursWorked  += Math.max(0, hours - breaks);
    }

    // Fallback: prorate contracted weekly hours
    if (hoursWorked === 0) {
      const weeklyHours = staff.payroll?.weeklyHours || 0;
      hoursWorked = periodFraction(weeklyHours * 52, frequency);
    }

    hoursWorked = r2(hoursWorked);

    const basicPay   = r2(hoursWorked * hourlyRate);
    const overtimePay = 0; // future: detect overtime threshold
    const bonus       = 0;
    const grossPay    = r2(basicPay + overtimePay + bonus);

    // Annualise for tax / NI calculation
    const annualGross = periodFraction(grossPay, frequency) === grossPay
      ? grossPay * (frequency === 'weekly' ? 52 : frequency === 'fortnightly' ? 26 : 12)
      : grossPay * 12; // safe default

    const periodTax        = r2(periodFraction(calcAnnualTax(annualGross), frequency));
    const periodEmployeeNI = r2(periodFraction(calcAnnualEmployeeNI(annualGross), frequency));
    const periodEmployerNI = r2(periodFraction(calcAnnualEmployerNI(annualGross), frequency));

    // Auto-enrolment pension (employee 5%, employer 3%) on qualifying earnings
    const annualQualifying  = Math.max(0, Math.min(annualGross, TAX.pensionUpper) - TAX.pensionLower);
    const periodQualifying  = r2(periodFraction(annualQualifying, frequency));
    const pensionEmployee   = r2(periodQualifying * 0.05);
    const pensionEmployer   = r2(periodQualifying * 0.03);

    const totalDeductions = r2(periodTax + periodEmployeeNI + pensionEmployee);
    const netPay          = r2(grossPay - totalDeductions);

    // NMW compliance
    const effectiveHourly = hoursWorked > 0 ? grossPay / hoursWorked : hourlyRate;
    const nmwCompliant    = effectiveHourly >= TAX.nmwAdult;

    employees.push({
      staffId:       staff._id,
      name:          staff.displayName,
      hoursWorked,
      hourlyRate,
      basicPay,
      overtimePay,
      bonus,
      grossPay,
      taxCode:       '1257L',
      incomeTax:     periodTax,
      employeeNI:    periodEmployeeNI,
      employerNI:    periodEmployerNI,
      pensionEmployee,
      pensionEmployer,
      studentLoan:   0,
      totalDeductions,
      netPay,
      nmwRate:       TAX.nmwAdult,
      nmwCompliant,
      paymentMethod: 'bacs',
    });
  }

  // Totals
  const totals = employees.reduce((acc, e) => {
    acc.grossPay        += e.grossPay;
    acc.incomeTax       += e.incomeTax;
    acc.employeeNI      += e.employeeNI;
    acc.employerNI      += e.employerNI;
    acc.pensionEmployee += e.pensionEmployee;
    acc.pensionEmployer += e.pensionEmployer;
    acc.studentLoan     += e.studentLoan;
    acc.totalDeductions += e.totalDeductions;
    acc.netPay          += e.netPay;
    return acc;
  }, { grossPay: 0, incomeTax: 0, employeeNI: 0, employerNI: 0, pensionEmployee: 0, pensionEmployer: 0, studentLoan: 0, totalDeductions: 0, netPay: 0 });

  Object.keys(totals).forEach(k => { totals[k] = r2(totals[k]); });
  totals.employerCost = r2(totals.grossPay + totals.employerNI + totals.pensionEmployer);

  const taxYear   = getTaxYear(start);
  const taxPeriod = getTaxPeriod(start, frequency);
  const payDate   = getPayDate(end);

  return new PayrollRun({
    store: storeId,
    period: { start, end, frequency, payDate, taxYear, taxPeriod },
    employees,
    totals,
    status: 'draft',
  });
}

function getTaxYear(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const cutoff = new Date(y, 3, 6); // 6 April
  return d < cutoff ? `${y - 1}/${String(y).slice(2)}` : `${y}/${String(y + 1).slice(2)}`;
}

function getTaxPeriod(date, frequency) {
  const d = new Date(date);
  const cutoff = new Date(d.getFullYear(), 3, 6);
  const msFromStart = d - cutoff;
  if (frequency === 'weekly')      return Math.ceil(msFromStart / (7 * 86400000));
  if (frequency === 'fortnightly') return Math.ceil(msFromStart / (14 * 86400000));
  return d.getMonth() < 3
    ? d.getMonth() + 10  // Jan=10, Feb=11, Mar=12
    : d.getMonth() - 2;  // Apr=1...Dec=9
}

function getPayDate(periodEnd) {
  const d = new Date(periodEnd);
  // Pay on 25th of the end month or last day if shorter
  const pay = new Date(d.getFullYear(), d.getMonth(), 25);
  if (pay > d) pay.setDate(d.getDate()); // if end date is before 25th use end date
  return pay;
}

/**
 * Recalculate a single employee's payroll for a given frequency.
 * Used when editing an employee record to update tax/NI based on new hours/rate.
 */
function recalculateEmployee(employee, frequency) {
  const hoursWorked = employee.hoursWorked || 0;
  const overtimeHours = employee.overtimeHours || 0;
  const hourlyRate = employee.hourlyRate || 0;

  const basicPay = r2(hoursWorked * hourlyRate);
  const overtimePay = r2(overtimeHours * hourlyRate * 1.5);
  const bonus = 0;
  const grossPay = r2(basicPay + overtimePay + bonus);

  // Annualise for tax / NI calculation
  const annualGross = grossPay * (frequency === 'weekly' ? 52 : frequency === 'fortnightly' ? 26 : 12);

  const periodTax = r2(periodFraction(calcAnnualTax(annualGross), frequency));
  const periodEmployeeNI = r2(periodFraction(calcAnnualEmployeeNI(annualGross), frequency));
  const periodEmployerNI = r2(periodFraction(calcAnnualEmployerNI(annualGross), frequency));

  // Auto-enrolment pension (employee 5%, employer 3%) on qualifying earnings
  const annualQualifying = Math.max(0, Math.min(annualGross, TAX.pensionUpper) - TAX.pensionLower);
  const periodQualifying = r2(periodFraction(annualQualifying, frequency));
  const pensionEmployee = r2(periodQualifying * 0.05);
  const pensionEmployer = r2(periodQualifying * 0.03);

  const totalDeductions = r2(periodTax + periodEmployeeNI + pensionEmployee);
  const netPay = r2(grossPay - totalDeductions);

  // NMW compliance
  const totalHours = hoursWorked + overtimeHours;
  const effectiveHourly = totalHours > 0 ? grossPay / totalHours : hourlyRate;
  const nmwCompliant = effectiveHourly >= TAX.nmwAdult;

  // Update employee object
  employee.basicPay = basicPay;
  employee.overtimePay = overtimePay;
  employee.bonus = bonus;
  employee.grossPay = grossPay;
  employee.incomeTax = periodTax;
  employee.employeeNI = periodEmployeeNI;
  employee.employerNI = periodEmployerNI;
  employee.pensionEmployee = pensionEmployee;
  employee.pensionEmployer = pensionEmployer;
  employee.studentLoan = 0;
  employee.totalDeductions = totalDeductions;
  employee.netPay = netPay;
  employee.nmwRate = TAX.nmwAdult;
  employee.nmwCompliant = nmwCompliant;

  return employee;
}

module.exports = { calculatePayroll, recalculateEmployee, calcAnnualTax, calcAnnualEmployeeNI, calcAnnualEmployerNI, TAX };
