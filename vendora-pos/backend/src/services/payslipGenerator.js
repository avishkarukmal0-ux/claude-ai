'use strict';

const PDFDocument = require('pdfkit');

/**
 * Generate a UK payslip PDF as a Buffer.
 * @param {object} employee  - employeePaySchema plain object from a PayrollRun
 * @param {object} run       - PayrollRun plain object (for period info)
 * @param {object} store     - Store plain object (for company name/address)
 * @returns {Promise<Buffer>}
 */
function generatePayslipPDF(employee, run, store) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const BLUE  = '#1e40af';
    const GRAY  = '#6b7280';
    const BLACK = '#111827';
    const GREEN = '#16a34a';
    const RED   = '#dc2626';
    const LGR   = '#f3f4f6'; // light gray fill

    const fmt  = (n) => `£${(n || 0).toFixed(2)}`;
    const fmtD = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';

    const pageW = doc.page.width - 100; // usable width (50 margin each side)

    // ── Header ────────────────────────────────────────────────────────────
    doc.fillColor(BLUE).fontSize(20).font('Helvetica-Bold')
       .text('PAYSLIP', 50, 50);

    doc.fillColor(GRAY).fontSize(9).font('Helvetica')
       .text(`Pay Period: ${fmtD(run.period?.start)} – ${fmtD(run.period?.end)}`, 50, 76)
       .text(`Pay Date: ${fmtD(run.period?.payDate)}`, 50, 90)
       .text(`Tax Year: ${run.period?.taxYear || '—'}  |  Tax Period: ${run.period?.taxPeriod || '—'}`, 50, 104);

    // Company info (top right)
    const companyName = store?.name || 'Vendora Store';
    const companyAddr = [store?.address?.line1, store?.address?.city, store?.address?.postcode]
      .filter(Boolean).join(', ');
    doc.fillColor(BLACK).fontSize(10).font('Helvetica-Bold')
       .text(companyName, 350, 50, { align: 'right', width: 200 });
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text(companyAddr, 350, 64, { align: 'right', width: 200 });

    // Divider
    doc.moveTo(50, 120).lineTo(545, 120).strokeColor(BLUE).lineWidth(2).stroke();

    // ── Employee details ──────────────────────────────────────────────────
    doc.fillColor(BLACK).fontSize(13).font('Helvetica-Bold')
       .text(employee.name || 'Employee', 50, 132);
    doc.fillColor(GRAY).fontSize(9).font('Helvetica');
    if (employee.employeeNumber) doc.text(`Employee No: ${employee.employeeNumber}`, 50, 150);
    doc.text(`Tax Code: ${employee.taxCode || '1257L'}`, 50, employee.employeeNumber ? 163 : 150);
    doc.text(`NI Category: A`, 50, employee.employeeNumber ? 176 : 163);

    let y = 210;

    // ── Earnings table ───────────────────────────────────────────────────
    const drawSectionHeader = (label, yPos) => {
      doc.rect(50, yPos, pageW, 18).fill(BLUE);
      doc.fillColor('white').fontSize(9).font('Helvetica-Bold')
         .text(label, 56, yPos + 4);
      return yPos + 18;
    };

    const drawRow = (label, value, yPos, highlight = false, valueColor = BLACK) => {
      if (highlight) doc.rect(50, yPos, pageW, 16).fill(LGR);
      doc.fillColor(BLACK).fontSize(9).font('Helvetica')
         .text(label, 56, yPos + 3, { width: 300 });
      doc.fillColor(valueColor).fontSize(9).font('Helvetica-Bold')
         .text(fmt(value), 400, yPos + 3, { align: 'right', width: 140 });
      return yPos + 16;
    };

    // Earnings
    y = drawSectionHeader('EARNINGS', y);
    y = drawRow(`Basic Pay (${employee.hoursWorked?.toFixed(1) || 0} hrs × ${fmt(employee.hourlyRate)}/hr)`, employee.basicPay, y, false);
    if (employee.overtimePay > 0)
      y = drawRow('Overtime Pay', employee.overtimePay, y, false);
    if (employee.bonus > 0)
      y = drawRow('Bonus', employee.bonus, y, false);
    y = drawRow('GROSS PAY', employee.grossPay, y, true);

    y += 8;

    // Deductions
    y = drawSectionHeader('DEDUCTIONS', y);
    y = drawRow('Income Tax (PAYE)', employee.incomeTax, y, false, RED);
    y = drawRow('National Insurance (Employee)', employee.employeeNI, y, false, RED);
    if (employee.pensionEmployee > 0)
      y = drawRow('Pension (Employee)', employee.pensionEmployee, y, false, RED);
    if (employee.studentLoan > 0)
      y = drawRow('Student Loan', employee.studentLoan, y, false, RED);
    y = drawRow('TOTAL DEDUCTIONS', employee.totalDeductions, y, true, RED);

    y += 8;

    // Net Pay — large highlight
    doc.rect(50, y, pageW, 28).fill(GREEN);
    doc.fillColor('white').fontSize(13).font('Helvetica-Bold')
       .text('NET PAY', 56, y + 7)
       .text(fmt(employee.netPay), 400, y + 7, { align: 'right', width: 140 });
    y += 36;

    // ── Employer costs (small, informational) ────────────────────────────
    y += 10;
    y = drawSectionHeader('EMPLOYER CONTRIBUTIONS (information only)', y);
    y = drawRow("Employer's National Insurance", employee.employerNI, y, false, GRAY);
    if (employee.pensionEmployer > 0)
      y = drawRow('Pension (Employer)', employee.pensionEmployer, y, false, GRAY);

    // ── NMW compliance notice ─────────────────────────────────────────────
    y += 16;
    if (!employee.nmwCompliant) {
      doc.rect(50, y, pageW, 22).fill('#fef2f2');
      doc.fillColor(RED).fontSize(8).font('Helvetica-Bold')
         .text(`⚠ NMW WARNING: Effective rate ${fmt(employee.grossPay / Math.max(employee.hoursWorked, 1))}/hr is below NMW of ${fmt(employee.nmwRate)}/hr`, 56, y + 6);
      y += 30;
    }

    // ── Footer ────────────────────────────────────────────────────────────
    doc.moveTo(50, 760).lineTo(545, 760).strokeColor(GRAY).lineWidth(0.5).stroke();
    doc.fillColor(GRAY).fontSize(7).font('Helvetica')
       .text('This is a computer-generated payslip. Please retain for your records.', 50, 766, { align: 'center', width: pageW });

    doc.end();
  });
}

module.exports = { generatePayslipPDF };
