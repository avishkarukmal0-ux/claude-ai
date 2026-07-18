import React, { useState, useCallback } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import NumericKeyboard from '../common/NumericKeyboard';
import toast from 'react-hot-toast';

// UK 2025/26 tax constants (mirrors payrollService.js)
const TAX = {
  personalAllowance: 12570,
  basicRate: 0.20, basicBand: 50270,
  higherRate: 0.40, higherBand: 125140,
  addRate: 0.45,
  niPrimaryThreshold: 12570, niUpperEarnings: 50270,
  niRatePrimary: 0.08, niRateUpper: 0.02,
  niSecondaryThreshold: 9100, niRateEmployer: 0.138,
  pensionLower: 6240, pensionUpper: 50270,
  nmwAdult: 12.21,
};

const r2 = (n) => Math.round((n || 0) * 100) / 100;

function annualTax(g) {
  const t = Math.max(0, g - TAX.personalAllowance);
  if (t <= 0) return 0;
  const basic  = Math.min(t, TAX.basicBand - TAX.personalAllowance);
  const higher = t > (TAX.basicBand - TAX.personalAllowance)
    ? Math.min(t - (TAX.basicBand - TAX.personalAllowance), TAX.higherBand - TAX.basicBand) : 0;
  const add = t > (TAX.higherBand - TAX.personalAllowance)
    ? t - (TAX.higherBand - TAX.personalAllowance) : 0;
  return basic * TAX.basicRate + higher * TAX.higherRate + add * TAX.addRate;
}

function annualEeNI(g) {
  if (g <= TAX.niPrimaryThreshold) return 0;
  return (Math.min(g, TAX.niUpperEarnings) - TAX.niPrimaryThreshold) * TAX.niRatePrimary
    + Math.max(0, g - TAX.niUpperEarnings) * TAX.niRateUpper;
}

function annualErNI(g) {
  return g <= TAX.niSecondaryThreshold ? 0 : (g - TAX.niSecondaryThreshold) * TAX.niRateEmployer;
}

function periodScale(freq) {
  return freq === 'weekly' ? 52 : freq === 'fortnightly' ? 26 : 12;
}

function recalc(emp, hours, overtimeHours, hourlyRate, freq) {
  const basicPay    = r2(hours * hourlyRate);
  const overtimePay = r2(overtimeHours * hourlyRate * 1.5);
  const grossPay    = r2(basicPay + overtimePay);
  const scale       = periodScale(freq);
  const annual      = grossPay * scale;

  const incomeTax       = r2(annualTax(annual) / scale);
  const employeeNI      = r2(annualEeNI(annual) / scale);
  const employerNI      = r2(annualErNI(annual) / scale);
  const aqAnnual        = Math.max(0, Math.min(annual, TAX.pensionUpper) - TAX.pensionLower);
  const pensionEmployee = r2(aqAnnual / scale * 0.05);
  const pensionEmployer = r2(aqAnnual / scale * 0.03);
  const totalDeductions = r2(incomeTax + employeeNI + pensionEmployee);
  const netPay          = r2(grossPay - totalDeductions);
  const totalHours      = hours + overtimeHours;
  const nmwCompliant    = totalHours > 0 ? (grossPay / totalHours) >= TAX.nmwAdult : hourlyRate >= TAX.nmwAdult;

  return { ...emp, hoursWorked: hours, overtimeHours, hourlyRate, basicPay, overtimePay, grossPay, incomeTax, employeeNI, employerNI, pensionEmployee, pensionEmployer, totalDeductions, netPay, nmwCompliant };
}

const NI_CATEGORIES = ['A','B','C','H','J','M','Z'];

export default function EditEmployeeModal({ employee, run, onSave, onClose }) {
  const freq = run?.period?.frequency || 'monthly';
  const [regularHours, setRegularHours] = useState(employee.hoursWorked || 0);
  const [overtimeHours, setOvertimeHours] = useState(employee.overtimeHours || 0);
  const [hourlyRate, setHourlyRate] = useState(employee.hourlyRate || 0);
  const [taxCode, setTaxCode] = useState(employee.taxCode || '1257L');
  const [niCategory, setNiCategory] = useState(employee.niCategory || 'A');
  const [paymentMethod, setPaymentMethod] = useState(employee.paymentMethod || 'bacs');
  const [notes, setNotes] = useState(employee.notes || '');
  const [editingField, setEditingField] = useState(null);

  const handleSave = useCallback(() => {
    const updated = recalc(
      { ...employee, taxCode, niCategory, paymentMethod, notes },
      regularHours, overtimeHours, hourlyRate, freq
    );
    toast.success(`${employee.name} updated`);
    onSave(updated);
    onClose();
  }, [employee, regularHours, overtimeHours, hourlyRate, taxCode, niCategory, paymentMethod, notes, freq, onSave, onClose]);

  const fmt = (n) => `£${Number(n || 0).toFixed(2)}`;
  const grossPay = r2(regularHours * hourlyRate + overtimeHours * hourlyRate * 1.5);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white">
          <h2 className="text-lg font-semibold">Edit {employee.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-500">Employee</p>
            <p className="text-lg font-semibold text-gray-900">{employee.name}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded-lg p-4">
              <label className="block text-xs text-gray-500 mb-2">Hours Worked</label>
              <button onClick={() => setEditingField('hours')} className="w-full text-right text-2xl font-bold text-blue-600 hover:bg-blue-50 p-2 rounded">
                {regularHours.toFixed(1)}h
              </button>
            </div>
            <div className="border rounded-lg p-4">
              <label className="block text-xs text-gray-500 mb-2">Overtime Hours</label>
              <button onClick={() => setEditingField('overtime')} className="w-full text-right text-2xl font-bold text-blue-600 hover:bg-blue-50 p-2 rounded">
                {overtimeHours.toFixed(1)}h
              </button>
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <label className="block text-xs text-gray-500 mb-2">Hourly Rate</label>
            <button onClick={() => setEditingField('rate')} className="w-full text-right text-2xl font-bold text-blue-600 hover:bg-blue-50 p-2 rounded">
              {fmt(hourlyRate)}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded-lg p-4">
              <label className="block text-xs text-gray-500 mb-2">Tax Code</label>
              <input type="text" value={taxCode} onChange={e => setTaxCode(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="1257L" />
            </div>
            <div className="border rounded-lg p-4">
              <label className="block text-xs text-gray-500 mb-2">NI Category</label>
              <select value={niCategory} onChange={e => setNiCategory(e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
                {NI_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <label className="block text-xs text-gray-500 mb-2">Payment Method</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
              <option value="bacs">Bank Transfer (BACS)</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
            </select>
          </div>

          <div className="border rounded-lg p-4">
            <label className="block text-xs text-gray-500 mb-2">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full border rounded px-2 py-1 text-sm h-20" placeholder="Notes for this payroll period" />
          </div>

          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-xs text-blue-600 mb-2 flex items-center gap-2"><AlertCircle size={14} /> Live preview</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-600">Gross Pay:</span>
                <p className="font-bold">{fmt(grossPay)}</p>
              </div>
              <div>
                <span className="text-gray-600">Regular + Overtime:</span>
                <p className="text-xs text-gray-500">{regularHours.toFixed(1)}h + {overtimeHours.toFixed(1)}h OT (×1.5)</p>
              </div>
            </div>
          </div>

          {editingField && (
            <NumericKeyboard
              value={editingField === 'hours' ? regularHours : editingField === 'overtime' ? overtimeHours : hourlyRate}
              onValueChange={(val) => {
                if (editingField === 'hours') setRegularHours(Math.min(val, 168));
                else if (editingField === 'overtime') setOvertimeHours(Math.min(val, 168));
                else setHourlyRate(Math.min(val, 999.99));
              }}
              onDone={() => setEditingField(null)}
              decimal={editingField === 'rate'}
              label={
                editingField === 'hours' ? 'Hours worked (max 168)' :
                editingField === 'overtime' ? 'Overtime hours (max 168)' :
                'Hourly rate (max £999.99)'
              }
            />
          )}
        </div>

        <div className="border-t p-4 flex gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="flex-1 px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            <Save size={16} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
