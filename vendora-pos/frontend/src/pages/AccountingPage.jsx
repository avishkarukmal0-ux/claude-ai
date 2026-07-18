import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Calculator, FileText, Users, Receipt, TrendingUp, TrendingDown,
  RefreshCw, Download, Plus, CheckCircle, Clock, AlertTriangle,
  ChevronRight, Trash2, Edit3, X, Check,
} from 'lucide-react';
import dayjs from 'dayjs';
import toast from 'react-hot-toast';
import * as acct from '../services/accounting';
import * as marginSvc from '../services/margins';
import * as staffSvc from '../services/staff';
import EditEmployeeModal from '../components/payroll/EditEmployeeModal';
import NumericKeyboard from '../components/common/NumericKeyboard';

const fmt  = (n) => `£${Number(n || 0).toFixed(2)}`;
const fmtK = (n) => {
  const v = Number(n || 0);
  return v >= 1000 ? `£${(v / 1000).toFixed(1)}k` : fmt(v);
};

function StatCard({ icon: Icon, label, value, sub, color = 'text-blue-600', bg = 'bg-blue-50' }) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div className={`p-2 rounded-lg ${bg} ${color}`}><Icon size={18} /></div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = {
    draft:         'bg-gray-100 text-gray-600',
    approved:      'bg-blue-100 text-blue-700',
    submitted:     'bg-yellow-100 text-yellow-700',
    submitted_rti: 'bg-purple-100 text-purple-700',
    paid:          'bg-green-100 text-green-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
function OverviewTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await acct.getDashboard();
      setData(res);
    } catch {
      toast.error('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex justify-center p-12"><RefreshCw className="animate-spin text-blue-600" size={28} /></div>;
  if (!data) return null;

  const pl = data.pl || {};
  const income = pl.income || {};
  const expenses = pl.operatingExpenses || {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Net Revenue (MTD)" value={fmtK(income.netRevenue)} sub={`${income.transactionCount || 0} transactions`} color="text-blue-600" bg="bg-blue-50" />
        <StatCard icon={TrendingUp} label="Gross Profit (MTD)" value={fmtK(pl.grossProfit)} sub={`${pl.grossMarginPct || 0}% margin`} color="text-green-600" bg="bg-green-50" />
        <StatCard icon={TrendingDown} label="Operating Expenses (MTD)" value={fmtK(expenses.total)} sub="inc. payroll" color="text-red-600" bg="bg-red-50" />
        <StatCard icon={Calculator} label="Net Profit (MTD)" value={fmtK(pl.netProfit)} sub={`${pl.netMarginPct || 0}% margin`} color={pl.netProfit >= 0 ? 'text-green-600' : 'text-red-600'} bg={pl.netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'} />
      </div>

      {/* Latest VAT return */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Latest VAT Return</h3>
          {data.latestVatReturn ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Period</span>
                <span className="font-medium">{data.latestVatReturn.period?.quarter || dayjs(data.latestVatReturn.period?.start).format('MMM YYYY')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Box 5 (Net VAT due)</span>
                <span className="font-semibold text-blue-700">{fmt(data.latestVatReturn.box5)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Status</span>
                <StatusBadge status={data.latestVatReturn.status} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No VAT returns yet</p>
          )}
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Latest Payroll Run</h3>
          {data.latestPayroll ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Period</span>
                <span className="font-medium">{dayjs(data.latestPayroll.period?.start).format('D MMM')} – {dayjs(data.latestPayroll.period?.end).format('D MMM YYYY')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Net Pay (total)</span>
                <span className="font-semibold text-blue-700">{fmt(data.latestPayroll.totals?.netPay)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Status</span>
                <StatusBadge status={data.latestPayroll.status} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No payroll runs yet</p>
          )}
        </div>
      </div>

      {/* Expense breakdown chart */}
      {expenses.byCategory && Object.keys(expenses.byCategory).length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-semibold text-gray-800 mb-4">Expense Breakdown (MTD)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={Object.entries(expenses.byCategory).map(([k, v]) => ({ name: k.replace('_', ' '), amount: v }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `£${v}`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={v => fmt(v)} />
              <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: VAT
// ─────────────────────────────────────────────────────────────────────────────
function VatTab() {
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [periodStart, setPeriodStart] = useState(dayjs().startOf('quarter').format('YYYY-MM-DD'));
  const [periodEnd, setPeriodEnd] = useState(dayjs().endOf('quarter').format('YYYY-MM-DD'));
  const [editingVat, setEditingVat] = useState(null); // { id, status }
  const [deleteVatConfirm, setDeleteVatConfirm] = useState(null); // id

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await acct.listVatReturns();
      setReturns(res.vatReturns || []);
    } catch {
      toast.error('Failed to load VAT returns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePreview = async () => {
    setCalculating(true);
    try {
      const res = await acct.previewVatReturn(periodStart, periodEnd);
      setPreview(res.vatReturn);
      setShowPreview(true);
    } catch {
      toast.error('Failed to calculate VAT return');
    } finally {
      setCalculating(false);
    }
  };

  const handleSave = async () => {
    try {
      await acct.createVatReturn(periodStart, periodEnd);
      toast.success('VAT return saved as draft');
      setShowPreview(false);
      load();
    } catch {
      toast.error('Failed to save VAT return');
    }
  };

  const handleUpdateStatus = async () => {
    if (!editingVat) return;
    try {
      await acct.updateVatReturn(editingVat.id, { status: editingVat.status });
      toast.success('Status updated');
      setEditingVat(null);
      load();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDeleteVat = async () => {
    if (!deleteVatConfirm) return;
    try {
      await acct.deleteVatReturn(deleteVatConfirm);
      toast.success('VAT return deleted');
      setDeleteVatConfirm(null);
      load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const VatBox = ({ num, label, value, highlight }) => (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-blue-300 bg-blue-50' : ''}`}>
      <div className="flex justify-between items-start">
        <div>
          <span className="text-xs font-bold text-blue-700">BOX {num}</span>
          <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        </div>
        <span className={`text-lg font-bold ${highlight ? 'text-blue-700' : 'text-gray-900'}`}>{fmt(value)}</span>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Calculate new return */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-gray-800 mb-4">Calculate VAT Return</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Period Start</label>
            <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Period End</label>
            <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
          </div>
          <button onClick={handlePreview} disabled={calculating} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {calculating ? <RefreshCw size={14} className="animate-spin" /> : <Calculator size={14} />}
            Calculate
          </button>
        </div>
      </div>

      {/* Preview modal */}
      {showPreview && preview && (
        <div className="bg-white rounded-xl border border-blue-200 p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-800">VAT100 Preview — {preview.period?.quarter}</h3>
            <button onClick={() => setShowPreview(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <VatBox num="1" label="VAT due on sales" value={preview.box1} />
            <VatBox num="2" label="VAT due on EU acquisitions" value={preview.box2} />
            <VatBox num="3" label="Total VAT due (1+2)" value={preview.box3} />
            <VatBox num="4" label="VAT reclaimed on purchases" value={preview.box4} />
            <VatBox num="5" label="Net VAT payable / reclaimable" value={preview.box5} highlight />
            <VatBox num="6" label="Total value of sales exc. VAT" value={preview.box6} />
            <VatBox num="7" label="Total value of purchases exc. VAT" value={preview.box7} />
            <VatBox num="8" label="Total supplies to EU" value={preview.box8} />
            <VatBox num="9" label="Total acquisitions from EU" value={preview.box9} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              <Check size={14} /> Save as Draft
            </button>
            <button onClick={() => setShowPreview(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Discard</button>
          </div>
        </div>
      )}

      {/* Returns list */}
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-semibold text-gray-800">VAT Return History</h3>
          <button onClick={load} className="text-gray-400 hover:text-gray-600"><RefreshCw size={15} /></button>
        </div>
        {loading ? (
          <div className="flex justify-center p-8"><RefreshCw className="animate-spin text-blue-600" size={22} /></div>
        ) : returns.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No VAT returns yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Period</th>
                <th className="px-4 py-3 text-right">Box 1 (VAT due)</th>
                <th className="px-4 py-3 text-right">Box 4 (VAT rec.)</th>
                <th className="px-4 py-3 text-right">Box 5 (Net)</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {returns.map(r => (
                <tr key={r._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.period?.quarter || dayjs(r.period?.start).format('MMM YYYY')}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.box1)}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.box4)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-700">{fmt(r.box5)}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => setEditingVat({ id: r._id, status: r.status })}
                        className="text-blue-600 hover:bg-blue-50 p-1 rounded" title="Change status">
                        <Edit3 size={14} />
                      </button>
                      <button onClick={() => setDeleteVatConfirm(r._id)}
                        className="text-red-500 hover:bg-red-50 p-1 rounded" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit status modal */}
      {editingVat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-900 mb-4">Edit VAT Return Status</h3>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select value={editingVat.status} onChange={e => setEditingVat({ ...editingVat, status: e.target.value })}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4">
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="filed">Filed</option>
            </select>
            <div className="flex gap-2">
              <button onClick={() => setEditingVat(null)} className="flex-1 px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleUpdateStatus} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteVatConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
            <p className="font-semibold text-gray-900 mb-2">Delete this VAT return?</p>
            <p className="text-sm text-gray-600 mb-4">This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteVatConfirm(null)} className="flex-1 px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDeleteVat} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: PAYROLL — UK 2025/26 tax helpers (client-side)
// ─────────────────────────────────────────────────────────────────────────────
const PTAX = {
  pa: 12570, basicRate: 0.20, basicBand: 50270,
  higherRate: 0.40, higherBand: 125140, addRate: 0.45,
  niPT: 12570, niUEL: 50270, niPrimary: 0.08, niUpper: 0.02,
  niST: 9100, niEr: 0.138,
  penLow: 6240, penHigh: 50270, nmw: 12.21,
};
const pr2 = (n) => Math.round((n || 0) * 100) / 100;
function pTax(g) {
  const t = Math.max(0, g - PTAX.pa);
  if (!t) return 0;
  const b = Math.min(t, PTAX.basicBand - PTAX.pa);
  const h = t > PTAX.basicBand - PTAX.pa ? Math.min(t - (PTAX.basicBand - PTAX.pa), PTAX.higherBand - PTAX.basicBand) : 0;
  const a = t > PTAX.higherBand - PTAX.pa ? t - (PTAX.higherBand - PTAX.pa) : 0;
  return b * PTAX.basicRate + h * PTAX.higherRate + a * PTAX.addRate;
}
function pEeNI(g) {
  if (g <= PTAX.niPT) return 0;
  return (Math.min(g, PTAX.niUEL) - PTAX.niPT) * PTAX.niPrimary + Math.max(0, g - PTAX.niUEL) * PTAX.niUpper;
}
function pErNI(g) { return g <= PTAX.niST ? 0 : (g - PTAX.niST) * PTAX.niEr; }
function pScale(freq) { return freq === 'weekly' ? 52 : freq === 'fortnightly' ? 26 : 12; }
function pRecalc(base, hours, overtime, hourlyRate, freq) {
  const basicPay = pr2(hours * hourlyRate);
  const overtimePay = pr2(overtime * hourlyRate * 1.5);
  const grossPay = pr2(basicPay + overtimePay);
  const sc = pScale(freq);
  const annual = grossPay * sc;
  const incomeTax = pr2(pTax(annual) / sc);
  const employeeNI = pr2(pEeNI(annual) / sc);
  const employerNI = pr2(pErNI(annual) / sc);
  const aq = Math.max(0, Math.min(annual, PTAX.penHigh) - PTAX.penLow);
  const pensionEmployee = pr2(aq / sc * 0.05);
  const pensionEmployer = pr2(aq / sc * 0.03);
  const totalDeductions = pr2(incomeTax + employeeNI + pensionEmployee);
  const netPay = pr2(grossPay - totalDeductions);
  const totalH = hours + overtime;
  const nmwCompliant = totalH > 0 ? (grossPay / totalH) >= PTAX.nmw : hourlyRate >= PTAX.nmw;
  return { ...base, hoursWorked: hours, overtimeHours: overtime, hourlyRate, basicPay, overtimePay, grossPay, incomeTax, employeeNI, employerNI, pensionEmployee, pensionEmployer, totalDeductions, netPay, nmwCompliant, bonus: 0, studentLoan: 0, nmwRate: PTAX.nmw };
}
function pSumTotals(employees) {
  const t = employees.reduce((a, e) => {
    a.grossPay += e.grossPay; a.incomeTax += e.incomeTax; a.employeeNI += e.employeeNI;
    a.employerNI += e.employerNI; a.pensionEmployee += e.pensionEmployee;
    a.pensionEmployer += e.pensionEmployer; a.totalDeductions += e.totalDeductions; a.netPay += e.netPay;
    return a;
  }, { grossPay:0, incomeTax:0, employeeNI:0, employerNI:0, pensionEmployee:0, pensionEmployer:0, totalDeductions:0, netPay:0 });
  Object.keys(t).forEach(k => { t[k] = pr2(t[k]); });
  t.employerCost = pr2(t.grossPay + t.employerNI + t.pensionEmployer);
  return t;
}

function PayrollTab() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);
  // hours: { [staffId]: { hours, overtime, hourlyRate, include } }
  const [hours, setHours] = useState({});
  const [keyboardFor, setKeyboardFor] = useState(null); // { staffId, field }
  const [periodStart, setPeriodStart] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [periodEnd, setPeriodEnd]   = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
  const [freq, setFreq] = useState('monthly');
  const [preview, setPreview] = useState(null);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteRunConfirm, setDeleteRunConfirm] = useState(null); // run id

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await acct.listPayrollRuns();
      setRuns(res.runs || []);
    } catch { toast.error('Failed to load payroll runs'); }
    finally { setLoading(false); }
  }, []);

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    try {
      const res = await staffSvc.getStaff();
      const active = (res.staff || []).filter(s => s.status === 'active');
      setStaff(active);
      setHours(prev => {
        const next = {};
        active.forEach(s => {
          next[s._id] = prev[s._id] || {
            hours: 0, overtime: 0,
            hourlyRate: s.payroll?.hourlyRate || 0,
            include: (s.payroll?.hourlyRate || 0) > 0,
          };
        });
        return next;
      });
    } catch { toast.error('Failed to load staff'); }
    finally { setStaffLoading(false); }
  }, []);

  useEffect(() => { loadHistory(); loadStaff(); }, [loadHistory, loadStaff]);

  const setField = (staffId, field, value) =>
    setHours(prev => ({ ...prev, [staffId]: { ...prev[staffId], [field]: value } }));

  const handleCalculate = () => {
    const included = staff.filter(s => hours[s._id]?.include && (hours[s._id]?.hourlyRate || 0) > 0);
    if (!included.length) { toast.error('No employees included or no rates set'); return; }
    const employees = included.map(s => {
      const h = hours[s._id];
      return pRecalc({
        staffId: s._id,
        name: s.displayName || s.name,
        taxCode: s.payroll?.taxCode || '1257L',
        niCategory: s.payroll?.niCategory || 'A',
        paymentMethod: s.payroll?.paymentMethod || 'bacs',
      }, h.hours || 0, h.overtime || 0, h.hourlyRate, freq);
    });
    setPreview({ employees, totals: pSumTotals(employees), period: { start: periodStart, end: periodEnd, frequency: freq } });
  };

  const handleSave = async () => {
    try {
      await acct.createPayrollRun(periodStart, periodEnd, freq, preview.employees);
      toast.success('Payroll run saved');
      setPreview(null);
      loadHistory();
    } catch { toast.error('Failed to save payroll run'); }
  };

  const handleApprove = async (id) => {
    try {
      await acct.updatePayrollRun(id, { status: 'approved' });
      toast.success('Payroll approved');
      loadHistory();
    } catch { toast.error('Failed to approve'); }
  };

  const handleDeleteRun = async () => {
    if (!deleteRunConfirm) return;
    try {
      await acct.deletePayrollRun(deleteRunConfirm);
      toast.success('Payroll run deleted');
      setDeleteRunConfirm(null);
      loadHistory();
    } catch { toast.error('Failed to delete'); }
  };

  const handleEmployeeSaved = (updated) => {
    const newEmps = preview.employees.map(e => e.staffId === updated.staffId ? updated : e);
    setPreview({ ...preview, employees: newEmps, totals: pSumTotals(newEmps) });
  };

  const handleDeleteEmployee = () => {
    if (!deleteConfirm) return;
    const newEmps = preview.employees.filter(e => e.staffId !== deleteConfirm.staffId);
    setPreview({ ...preview, employees: newEmps, totals: pSumTotals(newEmps) });
    toast.success(`${deleteConfirm.name} removed`);
    setDeleteConfirm(null);
  };

  const totalEstGross = staff.reduce((sum, s) => {
    const h = hours[s._id];
    if (!h?.include) return sum;
    return sum + pr2((h.hours || 0) * h.hourlyRate + (h.overtime || 0) * h.hourlyRate * 1.5);
  }, 0);

  const kbStaff = keyboardFor ? staff.find(s => s._id === keyboardFor.staffId) : null;
  const kbCurrent = keyboardFor
    ? (hours[keyboardFor.staffId]?.[keyboardFor.field] || 0) : 0;

  return (
    <div className="space-y-5">

      {/* ── Hours Entry ── */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-gray-800 mb-4">Run Payroll</h3>

        {/* Period */}
        <div className="flex flex-wrap gap-3 items-end mb-5">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Period Start</label>
            <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Period End</label>
            <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Frequency</label>
            <select className="border rounded-lg px-3 py-2 text-sm" value={freq} onChange={e => setFreq(e.target.value)}>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>

        {/* Staff hours grid */}
        {staffLoading ? (
          <div className="flex justify-center p-6"><RefreshCw className="animate-spin text-blue-600" size={20} /></div>
        ) : staff.length === 0 ? (
          <p className="text-sm text-center text-gray-400 py-6">No active staff found. Add staff with hourly rates in the Staff section.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border mb-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-3 py-3 w-8 text-center">✓</th>
                    <th className="px-3 py-3 text-left">Employee</th>
                    <th className="px-3 py-3 text-right">Rate / hr</th>
                    <th className="px-3 py-3 text-right">Reg Hours</th>
                    <th className="px-3 py-3 text-right">OT Hours</th>
                    <th className="px-3 py-3 text-right">Est. Gross</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {staff.map(s => {
                    const h = hours[s._id] || { hours: 0, overtime: 0, hourlyRate: 0, include: false };
                    const gross = pr2((h.hours || 0) * h.hourlyRate + (h.overtime || 0) * h.hourlyRate * 1.5);
                    const isActive = !!h.include;
                    return (
                      <tr key={s._id} className={isActive ? '' : 'opacity-40 bg-gray-50'}>
                        <td className="px-3 py-3 text-center">
                          <input type="checkbox" checked={isActive} onChange={e => setField(s._id, 'include', e.target.checked)} className="w-4 h-4 rounded text-blue-600 cursor-pointer" />
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium">{s.displayName || s.name}</p>
                          {s.role && <p className="text-xs text-gray-400">{s.role}</p>}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button disabled={!isActive} onClick={() => setKeyboardFor({ staffId: s._id, field: 'hourlyRate' })}
                            className="font-mono text-blue-600 hover:bg-blue-50 rounded px-2 py-1 w-full text-right disabled:pointer-events-none">
                            {fmt(h.hourlyRate)}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button disabled={!isActive} onClick={() => setKeyboardFor({ staffId: s._id, field: 'hours' })}
                            className="font-mono text-blue-600 hover:bg-blue-50 rounded px-2 py-1 w-full text-right disabled:pointer-events-none">
                            {Number(h.hours || 0).toFixed(1)}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button disabled={!isActive} onClick={() => setKeyboardFor({ staffId: s._id, field: 'overtime' })}
                            className="font-mono text-blue-600 hover:bg-blue-50 rounded px-2 py-1 w-full text-right disabled:pointer-events-none">
                            {Number(h.overtime || 0).toFixed(1)}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">
                          {isActive && gross > 0 ? fmt(gross) : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Total Est. Gross</td>
                    <td className="px-3 py-2 text-right font-bold text-gray-900">{fmt(totalEstGross)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Inline NumericKeyboard (mobile: fixed bottom, desktop: inline) */}
            {keyboardFor && (
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">
                  Editing <strong>{kbStaff?.displayName || kbStaff?.name}</strong> —{' '}
                  {keyboardFor.field === 'hours' ? 'Regular Hours' : keyboardFor.field === 'overtime' ? 'Overtime Hours' : 'Hourly Rate'}
                </p>
                <NumericKeyboard
                  value={kbCurrent}
                  onValueChange={val => setField(keyboardFor.staffId, keyboardFor.field,
                    Math.min(val, keyboardFor.field === 'hourlyRate' ? 999.99 : 168))}
                  onDone={() => setKeyboardFor(null)}
                  decimal={keyboardFor.field === 'hourlyRate'}
                  label=""
                />
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              <p className="text-xs text-gray-400">{staff.filter(s => hours[s._id]?.include).length} of {staff.length} employees included</p>
              <button onClick={handleCalculate}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 active:bg-blue-800">
                <Calculator size={16} /> Calculate Payroll
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Preview ── */}
      {preview && (
        <div className="bg-white rounded-xl border border-blue-200 p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-800">Payroll Preview</h3>
            <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">Gross Pay</p>
              <p className="text-lg font-bold text-gray-900">{fmt(preview.totals?.grossPay)}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">PAYE Tax</p>
              <p className="text-lg font-bold text-red-700">{fmt(preview.totals?.incomeTax)}</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">NI (Employee)</p>
              <p className="text-lg font-bold text-red-700">{fmt(preview.totals?.employeeNI)}</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500">Net Pay</p>
              <p className="text-lg font-bold text-green-700">{fmt(preview.totals?.netPay)}</p>
            </div>
          </div>

          {/* Employee breakdown */}
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2 text-left">Employee</th>
                  <th className="px-3 py-2 text-right">Hrs</th>
                  <th className="px-3 py-2 text-right">OT</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">PAYE</th>
                  <th className="px-3 py-2 text-right">NI (Ee)</th>
                  <th className="px-3 py-2 text-right">Pension</th>
                  <th className="px-3 py-2 text-right">Net Pay</th>
                  <th className="px-3 py-2 text-center">NMW</th>
                  <th className="px-3 py-2 text-center">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(preview.employees || []).map((e, i) => (
                  <tr key={i} className={!e.nmwCompliant ? 'bg-red-50' : ''}>
                    <td className="px-3 py-2 font-medium">{e.name}</td>
                    <td className="px-3 py-2 text-right">{e.hoursWorked?.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right text-orange-500">{(e.overtimeHours || 0).toFixed(1)}</td>
                    <td className="px-3 py-2 text-right">{fmt(e.grossPay)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmt(e.incomeTax)}</td>
                    <td className="px-3 py-2 text-right text-red-600">{fmt(e.employeeNI)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{fmt(e.pensionEmployee)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-green-700">{fmt(e.netPay)}</td>
                    <td className="px-3 py-2 text-center">
                      {e.nmwCompliant
                        ? <CheckCircle size={14} className="text-green-500 mx-auto" />
                        : <AlertTriangle size={14} className="text-red-500 mx-auto" title="Below NMW" />}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => setEditingEmployee(e)} className="text-blue-600 hover:bg-blue-50 p-1 rounded">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => setDeleteConfirm(e)} className="text-red-500 hover:bg-red-50 p-1 rounded">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600 uppercase">
                <tr>
                  <td colSpan={3} className="px-3 py-2">Totals</td>
                  <td className="px-3 py-2 text-right">{fmt(preview.totals?.grossPay)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmt(preview.totals?.incomeTax)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmt(preview.totals?.employeeNI)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{fmt(preview.totals?.pensionEmployee)}</td>
                  <td className="px-3 py-2 text-right text-green-700">{fmt(preview.totals?.netPay)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex items-center justify-between bg-blue-50 rounded-lg p-3 mb-4">
            <span className="text-sm font-medium text-blue-800">Total Employer Cost (gross + Er NI + pension)</span>
            <span className="text-xl font-bold text-blue-800">{fmt(preview.totals?.employerCost)}</span>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
              <Check size={14} /> Save Run
            </button>
            <button onClick={() => setPreview(null)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Discard</button>
          </div>

          {editingEmployee && (
            <EditEmployeeModal employee={editingEmployee} run={preview} onSave={handleEmployeeSaved} onClose={() => setEditingEmployee(null)} />
          )}

          {deleteConfirm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
                <p className="font-semibold text-gray-900 mb-2">Remove {deleteConfirm.name}?</p>
                <p className="text-sm text-gray-600 mb-4">Removes them from this payroll run only — not from staff records.</p>
                <div className="flex gap-2">
                  <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
                  <button onClick={handleDeleteEmployee} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Remove</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Payroll History ── */}
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-semibold text-gray-800">Payroll History</h3>
          <button onClick={loadHistory} className="text-gray-400 hover:text-gray-600"><RefreshCw size={15} /></button>
        </div>
        {loading ? (
          <div className="flex justify-center p-8"><RefreshCw className="animate-spin text-blue-600" size={22} /></div>
        ) : runs.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No payroll runs yet</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Period</th>
                <th className="px-4 py-3 text-right">Staff</th>
                <th className="px-4 py-3 text-right">Gross Pay</th>
                <th className="px-4 py-3 text-right">Net Pay</th>
                <th className="px-4 py-3 text-right">Employer Cost</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {runs.map(r => (
                <tr key={r._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{dayjs(r.period?.start).format('D MMM')} – {dayjs(r.period?.end).format('D MMM YYYY')}</td>
                  <td className="px-4 py-3 text-right">{r.employees?.length || 0}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.totals?.grossPay)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">{fmt(r.totals?.netPay)}</td>
                  <td className="px-4 py-3 text-right">{fmt(r.totals?.employerCost)}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-2 justify-center flex-wrap items-center">
                      {r.status === 'draft' && (
                        <button onClick={() => handleApprove(r._id)} className="text-xs text-blue-600 hover:underline">Approve</button>
                      )}
                      {(r.employees || []).map(e => (
                        <a key={e.staffId} href={acct.downloadPayslip(r._id, e.staffId)} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:underline flex items-center gap-1">
                          <Download size={10} />{e.name.split(' ')[0]}
                        </a>
                      ))}
                      <button onClick={() => setDeleteRunConfirm(r._id)}
                        className="text-red-500 hover:bg-red-50 p-1 rounded" title="Delete run">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete run confirmation */}
      {deleteRunConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
            <p className="font-semibold text-gray-900 mb-2">Delete this payroll run?</p>
            <p className="text-sm text-gray-600 mb-4">All employee payroll data for this period will be permanently removed. This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteRunConfirm(null)} className="flex-1 px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDeleteRun} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: EXPENSES
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value: 'stock_purchases', label: 'Stock Purchases' },
  { value: 'staff_wages',     label: 'Staff Wages' },
  { value: 'rent_rates',      label: 'Rent & Rates' },
  { value: 'utilities',       label: 'Utilities' },
  { value: 'insurance',       label: 'Insurance' },
  { value: 'equipment',       label: 'Equipment' },
  { value: 'software',        label: 'Software' },
  { value: 'marketing',       label: 'Marketing' },
  { value: 'professional_fees', label: 'Professional Fees' },
  { value: 'travel',          label: 'Travel' },
  { value: 'repairs',         label: 'Repairs' },
  { value: 'packaging',       label: 'Packaging' },
  { value: 'other',           label: 'Other' },
];

const BLANK_EXPENSE = { date: dayjs().format('YYYY-MM-DD'), category: 'other', description: '', netAmount: '', vatAmount: '', vatRate: '20', vatReclaimable: false, paymentMethod: 'card' };

function ExpensesTab() {
  const [expenses, setExpenses] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null); // expense object being edited
  const [deleteExpenseConfirm, setDeleteExpenseConfirm] = useState(null); // id
  const [from, setFrom] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [to, setTo]     = useState(dayjs().format('YYYY-MM-DD'));
  const [form, setForm] = useState(BLANK_EXPENSE);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await acct.listExpenses({ from, to });
      setExpenses(res.expenses || []);
      setTotal(res.total || 0);
    } catch {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await acct.createExpense(form);
      toast.success('Expense added');
      setShowAdd(false);
      setForm(BLANK_EXPENSE);
      load();
    } catch {
      toast.error('Failed to add expense');
    } finally {
      setSaving(false);
    }
  };

  const handleEditOpen = (ex) => {
    setEditingExpense(ex);
    setForm({
      date: dayjs(ex.date).format('YYYY-MM-DD'),
      category: ex.category || 'other',
      description: ex.description || '',
      netAmount: String(ex.netAmount || ''),
      vatAmount: String(ex.vatAmount || ''),
      vatRate: String(ex.vatRate || '20'),
      vatReclaimable: !!ex.vatReclaimable,
      paymentMethod: ex.paymentMethod || 'card',
    });
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await acct.updateExpense(editingExpense._id, form);
      toast.success('Expense updated');
      setEditingExpense(null);
      setForm(BLANK_EXPENSE);
      load();
    } catch {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteExpenseConfirm) return;
    try {
      await acct.deleteExpense(deleteExpenseConfirm);
      toast.success('Deleted');
      setDeleteExpenseConfirm(null);
      load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const catLabel = (v) => CATEGORIES.find(c => c.value === v)?.label || v;

  return (
    <div className="space-y-5">
      {/* Filter + Add */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex flex-wrap gap-3 items-end justify-between">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus size={14} /> Add Expense
          </button>
        </div>
      </div>

      {/* Add / Edit form (shared) */}
      {(showAdd || editingExpense) && (
        <div className="bg-white rounded-xl border border-blue-200 p-5">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-800">{editingExpense ? 'Edit Expense' : 'New Expense'}</h3>
            <button onClick={() => { setShowAdd(false); setEditingExpense(null); setForm(BLANK_EXPENSE); }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <form onSubmit={editingExpense ? handleEditSave : handleAdd} className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date *</label>
              <input type="date" required className="w-full border rounded-lg px-3 py-2 text-sm" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category *</label>
              <select required className="w-full border rounded-lg px-3 py-2 text-sm" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs text-gray-500 mb-1">Description *</label>
              <input required className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g. Monthly rent" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Net Amount (exc VAT) *</label>
              <input type="number" step="0.01" min="0" required className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0.00" value={form.netAmount} onChange={e => setForm(f => ({ ...f, netAmount: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">VAT Amount</label>
              <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0.00" value={form.vatAmount} onChange={e => setForm(f => ({ ...f, vatAmount: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Payment Method</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                <option value="card">Card</option>
                <option value="bacs">BACS</option>
                <option value="direct_debit">Direct Debit</option>
                <option value="cash">Cash</option>
                <option value="cheque">Cheque</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-3 flex items-center gap-2">
              <input type="checkbox" id="vatRec" checked={form.vatReclaimable} onChange={e => setForm(f => ({ ...f, vatReclaimable: e.target.checked }))} />
              <label htmlFor="vatRec" className="text-sm text-gray-600">VAT reclaimable on this expense</label>
            </div>
            <div className="col-span-2 md:col-span-3 flex gap-2">
              <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                {editingExpense ? 'Update' : 'Save'}
              </button>
              <button type="button" onClick={() => { setShowAdd(false); setEditingExpense(null); setForm(BLANK_EXPENSE); }} className="px-4 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Expenses table */}
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-semibold text-gray-800">Expenses ({total})</h3>
          <button onClick={load} className="text-gray-400 hover:text-gray-600"><RefreshCw size={15} /></button>
        </div>
        {loading ? (
          <div className="flex justify-center p-8"><RefreshCw className="animate-spin text-blue-600" size={22} /></div>
        ) : expenses.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No expenses in this period</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Net</th>
                <th className="px-4 py-3 text-right">VAT</th>
                <th className="px-4 py-3 text-right">Gross</th>
                <th className="px-4 py-3 text-center">VAT Rec.</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {expenses.map(ex => (
                <tr key={ex._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{dayjs(ex.date).format('DD/MM/YYYY')}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">{catLabel(ex.category)}</span>
                  </td>
                  <td className="px-4 py-3">{ex.description}</td>
                  <td className="px-4 py-3 text-right">{fmt(ex.netAmount)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{fmt(ex.vatAmount)}</td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(ex.grossAmount)}</td>
                  <td className="px-4 py-3 text-center">
                    {ex.vatReclaimable
                      ? <CheckCircle size={14} className="text-green-500 mx-auto" />
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => handleEditOpen(ex)} className="text-blue-600 hover:bg-blue-50 p-1 rounded" title="Edit">
                        <Edit3 size={14} />
                      </button>
                      <button onClick={() => setDeleteExpenseConfirm(ex._id)} className="text-red-500 hover:bg-red-50 p-1 rounded" title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td colSpan="3" className="px-4 py-3 text-right text-gray-600">Totals:</td>
                <td className="px-4 py-3 text-right">{fmt(expenses.reduce((s, e) => s + (e.netAmount || 0), 0))}</td>
                <td className="px-4 py-3 text-right text-gray-500">{fmt(expenses.reduce((s, e) => s + (e.vatAmount || 0), 0))}</td>
                <td className="px-4 py-3 text-right">{fmt(expenses.reduce((s, e) => s + (e.grossAmount || 0), 0))}</td>
                <td colSpan="2" />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Delete expense confirmation */}
      {deleteExpenseConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4">
            <p className="font-semibold text-gray-900 mb-2">Delete this expense?</p>
            <p className="text-sm text-gray-600 mb-4">This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteExpenseConfirm(null)} className="flex-1 px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDeleteConfirmed} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: P&L REPORT
// ─────────────────────────────────────────────────────────────────────────────
function ReportsTab() {
  const [pl, setPl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [to, setTo]     = useState(dayjs().format('YYYY-MM-DD'));
  const [marginSettings, setMarginSettings] = useState(null);

  useEffect(() => {
    marginSvc.getMarginSettings().then(r => setMarginSettings(r.settings)).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await acct.getProfitLoss(from, to);
      setPl(res.pl);
    } catch {
      toast.error('Failed to generate P&L');
    } finally {
      setLoading(false);
    }
  };

  // Compute overall target margin from margin settings
  const overallTargetMargin = marginSettings
    ? Math.round(
        (marginSettings.categories || []).reduce((s, c) => s + (c.targetMargin || 0), marginSettings.defaultMargin || 30) /
        ((marginSettings.categories?.length || 0) + 1)
      )
    : null;

  const Row = ({ label, value, indent = 0, bold = false, highlight = false, positive = true }) => (
    <tr className={highlight ? 'bg-blue-50' : ''}>
      <td className={`py-2 text-sm ${bold ? 'font-semibold' : 'text-gray-600'}`} style={{ paddingLeft: `${1 + indent * 1.5}rem` }}>{label}</td>
      <td className={`py-2 text-right text-sm ${bold ? 'font-semibold' : ''} ${highlight ? 'text-blue-800' : value < 0 ? 'text-red-600' : ''}`}>
        {fmt(Math.abs(value || 0))}{value < 0 || !positive ? '' : ''}
      </td>
    </tr>
  );

  const exportCSV = () => {
    if (!pl) return;
    const rows = [
      ['Vendora POS — Profit & Loss Statement'],
      [`Period: ${dayjs(pl.period?.start).format('DD/MM/YYYY')} to ${dayjs(pl.period?.end).format('DD/MM/YYYY')}`],
      [],
      ['INCOME'],
      ['Gross Revenue', pl.income?.grossRevenue],
      ['Less: Refunds', -pl.income?.refunds],
      ['Less: VAT on Sales', -pl.income?.vatOnSales],
      ['Net Revenue', pl.income?.netRevenue],
      [],
      ['COST OF GOODS SOLD'],
      ['Cost of Goods', pl.costOfGoodsSold?.total],
      ['Gross Profit', pl.grossProfit],
      [`Gross Margin`, `${pl.grossMarginPct}%`],
      [],
      ['OPERATING EXPENSES'],
      ...Object.entries(pl.operatingExpenses?.byCategory || {}).map(([k, v]) => [k.replace('_', ' '), v]),
      ['Total Expenses', pl.operatingExpenses?.total],
      [],
      ['OPERATING PROFIT', pl.operatingProfit],
      ['NET PROFIT', pl.netProfit],
      [`Net Margin`, `${pl.netMarginPct}%`],
    ];
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pl-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border p-5">
        <div className="flex flex-wrap gap-3 items-end justify-between">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <button onClick={load} disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
              Generate P&L
            </button>
          </div>
          {pl && (
            <button onClick={exportCSV} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {pl && (
        <>
        <div className="bg-white rounded-xl border p-6">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-bold text-gray-900">Profit &amp; Loss Statement</h2>
            <p className="text-sm text-gray-500">{dayjs(pl.period?.start).format('D MMM YYYY')} – {dayjs(pl.period?.end).format('D MMM YYYY')}</p>
          </div>
          <p className="text-xs text-gray-400 mb-5">{pl.income?.transactionCount} transactions</p>

          <table className="w-full border-collapse">
            <tbody>
              <tr className="border-t-2 border-gray-200">
                <td colSpan="2" className="pt-3 pb-1 font-bold text-gray-700 text-xs uppercase tracking-wider">Income</td>
              </tr>
              <Row label="Gross Revenue" value={pl.income?.grossRevenue} />
              <Row label="Less: Refunds" value={-pl.income?.refunds} indent={1} />
              <Row label="Less: VAT on Sales" value={-pl.income?.vatOnSales} indent={1} />
              <Row label="Net Revenue" value={pl.income?.netRevenue} bold />

              <tr className="border-t-2 border-gray-200">
                <td colSpan="2" className="pt-3 pb-1 font-bold text-gray-700 text-xs uppercase tracking-wider">Cost of Goods Sold</td>
              </tr>
              <Row label="Cost of Goods" value={-pl.costOfGoodsSold?.total} />
              <Row label="Gross Profit" value={pl.grossProfit} bold highlight />
              <tr>
                <td className="py-1 text-xs text-gray-400 pl-4">Gross Margin</td>
                <td className="py-1 text-xs text-right text-gray-400">{pl.grossMarginPct}%</td>
              </tr>

              <tr className="border-t-2 border-gray-200">
                <td colSpan="2" className="pt-3 pb-1 font-bold text-gray-700 text-xs uppercase tracking-wider">Operating Expenses</td>
              </tr>
              {Object.entries(pl.operatingExpenses?.byCategory || {}).map(([k, v]) => (
                <Row key={k} label={k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} value={-v} indent={1} />
              ))}
              <Row label="Total Expenses" value={-pl.operatingExpenses?.total} bold />

              <tr className="border-t-2 border-gray-200">
                <td colSpan="2" className="pt-2" />
              </tr>
              <Row label="Operating Profit" value={pl.operatingProfit} bold highlight />
              <Row label="Net Profit" value={pl.netProfit} bold highlight />
              <tr>
                <td className="py-1 text-xs text-gray-400 pl-4">Net Margin</td>
                <td className="py-1 text-xs text-right text-gray-400">{pl.netMarginPct}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Margin Analysis */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="text-base font-bold text-gray-900 mb-1">Margin Analysis</h2>
          <p className="text-xs text-gray-400 mb-4">Gross margin by category compared to your targets</p>

          {/* Overall comparison */}
          <div className="flex flex-wrap gap-4 mb-5 pb-5 border-b">
            <div className="flex-1 min-w-[180px] bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-500 mb-1">Overall Gross Margin (This Period)</p>
              <p className={`text-3xl font-bold ${pl.grossMarginPct >= (overallTargetMargin || 25) ? 'text-green-600' : 'text-amber-600'}`}>
                {pl.grossMarginPct}%
                {overallTargetMargin && (
                  <span className={`ml-2 text-sm font-normal ${pl.grossMarginPct >= overallTargetMargin ? 'text-green-500' : 'text-amber-500'}`}>
                    {pl.grossMarginPct >= overallTargetMargin ? '✓ Above target' : '⚠ Below target'}
                  </span>
                )}
              </p>
            </div>
            {overallTargetMargin && (
              <div className="flex-1 min-w-[180px] bg-blue-50 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">Your Avg Target Margin</p>
                <p className="text-3xl font-bold text-blue-700">{overallTargetMargin}%</p>
                <p className="text-xs text-gray-400 mt-1">Weighted avg across {(marginSettings?.categories?.length || 0)} categories</p>
              </div>
            )}
          </div>

          {/* Category breakdown from P&L COGS by category */}
          {pl.costOfGoodsSold?.byCategory && Object.keys(pl.costOfGoodsSold.byCategory).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-xs font-semibold text-gray-500 uppercase">Category</th>
                    <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Revenue</th>
                    <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">CoGS</th>
                    <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Gross Profit</th>
                    <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Margin</th>
                    <th className="text-right py-2 text-xs font-semibold text-gray-500 uppercase">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {Object.entries(pl.costOfGoodsSold.byCategory).map(([cat, cogs]) => {
                    const rev = pl.income?.byCategory?.[cat] || 0;
                    const profit = rev - cogs;
                    const margin = rev > 0 ? Math.round((profit / rev) * 100) : 0;
                    const rule = marginSettings
                      ? (() => {
                          const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                          const cats = marginSettings.categories || [];
                          let m = cats.find(c => norm(c.name) === norm(cat));
                          if (!m) m = cats.find(c => norm(cat).includes(norm(c.name)) || norm(c.name).includes(norm(cat)));
                          return m || null;
                        })()
                      : null;
                    const target = rule?.targetMargin ?? overallTargetMargin;
                    const minTarget = rule?.minMargin ?? 0;
                    const isRed = target && margin < minTarget;
                    const isAmber = !isRed && target && margin < target;
                    return (
                      <tr key={cat} className="hover:bg-gray-50">
                        <td className="py-2.5 font-medium text-gray-900">
                          {isRed && <span className="mr-1" title="Below minimum margin">⚠</span>}
                          {cat}
                        </td>
                        <td className="py-2.5 text-right font-mono">{fmt(rev)}</td>
                        <td className="py-2.5 text-right font-mono text-red-600">{fmt(cogs)}</td>
                        <td className="py-2.5 text-right font-mono font-semibold">{fmt(profit)}</td>
                        <td className="py-2.5 text-right">
                          <span className={`font-bold ${isRed ? 'text-red-600' : isAmber ? 'text-amber-600' : 'text-green-600'}`}>
                            {margin}%
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-gray-400 text-xs">
                          {target != null ? `${target}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">
              Category breakdown not available — P&L was generated without category-level COGS data.
            </p>
          )}
        </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',  label: 'Overview',  Icon: TrendingUp },
  { id: 'vat',       label: 'VAT',       Icon: FileText },
  { id: 'payroll',   label: 'Payroll',   Icon: Users },
  { id: 'expenses',  label: 'Expenses',  Icon: Receipt },
  { id: 'reports',   label: 'P&L',       Icon: Calculator },
];

export default function AccountingPage() {
  const [tab, setTab] = useState('overview');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Accounting</h1>
        <p className="text-sm text-gray-500 mt-1">VAT returns, payroll (PAYE/NI), expenses, and financial reports</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'vat'      && <VatTab />}
      {tab === 'payroll'  && <PayrollTab />}
      {tab === 'expenses' && <ExpensesTab />}
      {tab === 'reports'  && <ReportsTab />}
    </div>
  );
}
