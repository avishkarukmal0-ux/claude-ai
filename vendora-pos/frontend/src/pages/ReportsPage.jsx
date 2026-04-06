import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, ShoppingBag, Users, DollarSign, FileText, RefreshCw } from 'lucide-react';
import * as reportsSvc from '../services/reports';
import api from '../services/api';
import dayjs from 'dayjs';

const COLORS = ['#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#BE185D', '#065F46'];

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary' }) {
  return (
    <div className="bg-white rounded-xl border p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div className={`p-2 rounded-lg bg-gray-50 ${color}`}><Icon size={18} /></div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function ReportsPage() {
  const [tab, setTab] = useState('summary');
  const [dateFrom, setDateFrom] = useState(dayjs().subtract(7, 'day').format('YYYY-MM-DD'));
  const [dateTo, setDateTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [summary, setSummary] = useState(null);
  const [hourly, setHourly] = useState([]);
  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(false);
  const [xReport, setXReport] = useState(null);
  const [zReport, setZReport] = useState(null);
  const [tillId, setTillId] = useState('TILL-1');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { dateFrom, dateTo };
      const [sumRes, hourRes, catRes, staffRes] = await Promise.allSettled([
        reportsSvc.getSummary(params),
        reportsSvc.getHourlyBreakdown(params),
        reportsSvc.getCategoryBreakdown(params),
        reportsSvc.getStaffPerformance(params),
      ]);
      if (sumRes.status === 'fulfilled') setSummary(sumRes.value);
      if (hourRes.status === 'fulfilled') setHourly(hourRes.value?.data || hourRes.value || []);
      if (catRes.status === 'fulfilled') setCategories(catRes.value?.data || catRes.value || []);
      if (staffRes.status === 'fulfilled') setStaff(staffRes.value?.data || staffRes.value || []);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => { loadData(); }, [loadData]);

  async function loadXReport() {
    try { const r = await reportsSvc.getXReport(tillId); setXReport(r); } catch {}
  }
  async function loadZReport() {
    try { const r = await reportsSvc.getZReport(tillId); setZReport(r); } catch {}
  }

  const tabs = [
    { id: 'summary', label: 'Summary' },
    { id: 'hourly', label: 'Hourly' },
    { id: 'categories', label: 'Categories' },
    { id: 'staff', label: 'Staff' },
    { id: 'xz', label: 'X/Z Reports' },
    { id: 'custom', label: '🔧 Custom Builder' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Sales performance and analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <button onClick={loadData} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>}

      {!loading && tab === 'summary' && summary && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={DollarSign} label="Total Revenue" value={`£${Number(summary.totalRevenue || 0).toFixed(2)}`} sub={`${summary.transactionCount || 0} transactions`} color="text-green-600" />
            <StatCard icon={ShoppingBag} label="Avg Basket" value={`£${Number(summary.averageBasket || 0).toFixed(2)}`} sub="per transaction" color="text-primary" />
            <StatCard icon={TrendingUp} label="Total VAT" value={`£${Number(summary.totalVat || 0).toFixed(2)}`} sub="collected" color="text-purple-600" />
            <StatCard icon={Users} label="Customers" value={summary.uniqueCustomers || 0} sub="with loyalty" color="text-orange-600" />
          </div>
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Payment Methods</h3>
            <div className="grid grid-cols-3 gap-4">
              {(summary.paymentBreakdown || []).map(p => (
                <div key={p.method} className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-lg font-bold text-gray-900">£{Number(p.total).toFixed(2)}</p>
                  <p className="text-sm text-gray-500 capitalize">{p.method}</p>
                  <p className="text-xs text-gray-400">{p.count} txns</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'hourly' && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-800 mb-4">Sales by Hour</h3>
          {hourly.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No data for this period</p>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={hourly}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v, n) => n === 'revenue' ? [`£${Number(v).toFixed(2)}`, 'Revenue'] : [v, 'Transactions']} />
                <Bar dataKey="revenue" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {!loading && tab === 'categories' && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Revenue by Category</h3>
            {categories.length === 0 ? (
              <p className="text-gray-400 text-center py-8">No data for this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={categories} dataKey="revenue" nameKey="category" cx="50%" cy="50%" outerRadius={100} label={({ category, percent }) => `${category} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => `£${Number(v).toFixed(2)}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="bg-white rounded-xl border p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Category Breakdown</h3>
            <div className="space-y-2">
              {categories.map((c, i) => (
                <div key={c.category} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-sm font-medium text-gray-700">{c.category}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">£{Number(c.revenue).toFixed(2)}</p>
                    <p className="text-xs text-gray-400">{c.units} units</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'staff' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Staff Member</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Transactions</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Revenue</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Avg Basket</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Voids</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Discounts</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {staff.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No data for this period</td></tr>
              ) : staff.map(s => (
                <tr key={s.staffId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 text-right">{s.transactionCount}</td>
                  <td className="px-4 py-3 text-right font-medium">£{Number(s.revenue).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">£{Number(s.averageBasket).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-red-500">{s.voidCount}</td>
                  <td className="px-4 py-3 text-right text-orange-500">£{Number(s.discountsGiven).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'xz' && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* X Report */}
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-800">X Report</h3>
                <p className="text-xs text-gray-400">Read-only mid-day report</p>
              </div>
              <div className="flex items-center gap-2">
                <input className="border rounded px-2 py-1 text-sm w-24" value={tillId} onChange={e => setTillId(e.target.value)} placeholder="TILL-1" />
                <button onClick={loadXReport} className="bg-primary text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-primary/90">
                  <FileText size={14} className="inline mr-1" />Run X
                </button>
              </div>
            </div>
            {xReport ? (
              <ReportDisplay report={xReport} />
            ) : (
              <p className="text-gray-400 text-sm text-center py-8">Click "Run X" to generate</p>
            )}
          </div>
          {/* Z Report */}
          <div className="bg-white rounded-xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-800">Z Report</h3>
                <p className="text-xs text-red-500 font-medium">Closes the day — use with care</p>
              </div>
              <button onClick={loadZReport} className="bg-red-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-red-700">
                <FileText size={14} className="inline mr-1" />Run Z
              </button>
            </div>
            {zReport ? (
              <ReportDisplay report={zReport} />
            ) : (
              <p className="text-gray-400 text-sm text-center py-8">Click "Run Z" to close day and generate</p>
            )}
          </div>
        </div>
      )}

      {/* Custom Report Builder (#139) */}
      {tab === 'custom' && <CustomReportBuilder />}
    </div>
  );
}

// Custom Report Builder Component (#139)
function CustomReportBuilder() {
  const [from, setFrom] = useState(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));
  const [groupBy, setGroupBy] = useState('day');
  const [metrics, setMetrics] = useState(['revenue', 'transactions']);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const allMetrics = [
    { id: 'revenue', label: 'Revenue' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'avgBasket', label: 'Avg Basket' },
    { id: 'itemsSold', label: 'Items Sold' },
  ];

  function toggleMetric(m) {
    setMetrics(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  async function runReport() {
    setLoading(true);
    try {
      const { data } = await api.post('/reports/custom', { from, to, metrics, groupBy });
      setResult(data);
    } catch { }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold text-gray-800 mb-4">Report Parameters</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Group By</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={groupBy} onChange={e => setGroupBy(e.target.value)}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="staff">Staff</option>
              <option value="till">Till</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={runReport} disabled={loading} className="w-full bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {loading ? 'Running…' : 'Run Report'}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-2">Metrics</label>
          <div className="flex gap-2 flex-wrap">
            {allMetrics.map(m => (
              <button key={m.id} onClick={() => toggleMetric(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${metrics.includes(m.id) ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {result && (
        <>
          {/* Totals */}
          <div className="grid grid-cols-4 gap-4">
            {[
              ['Total Revenue', `£${Number(result.totals.revenue).toFixed(2)}`],
              ['Transactions', result.totals.transactions],
              ['Items Sold', result.totals.itemsSold],
              ['Avg Basket', `£${Number(result.totals.avgBasket).toFixed(2)}`],
            ].map(([label, value]) => (
              <div key={label} className="bg-white rounded-xl border p-4">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b flex justify-between">
              <h3 className="font-semibold text-sm text-gray-800">Results by {groupBy}</h3>
              <span className="text-xs text-gray-400">{result.rows.length} rows</span>
            </div>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left">{groupBy}</th>
                    {metrics.includes('revenue') && <th className="px-4 py-3 text-right">Revenue</th>}
                    {metrics.includes('transactions') && <th className="px-4 py-3 text-right">Transactions</th>}
                    {metrics.includes('avgBasket') && <th className="px-4 py-3 text-right">Avg Basket</th>}
                    {metrics.includes('itemsSold') && <th className="px-4 py-3 text-right">Items</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {result.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{row._id}</td>
                      {metrics.includes('revenue') && <td className="px-4 py-3 text-right font-mono">£{Number(row.revenue).toFixed(2)}</td>}
                      {metrics.includes('transactions') && <td className="px-4 py-3 text-right">{row.transactions}</td>}
                      {metrics.includes('avgBasket') && <td className="px-4 py-3 text-right font-mono">£{Number(row.avgBasket).toFixed(2)}</td>}
                      {metrics.includes('itemsSold') && <td className="px-4 py-3 text-right">{row.itemsSold}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bar chart */}
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-gray-800 mb-3 text-sm">Revenue by {groupBy}</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={result.rows}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="_id" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `£${v}`} />
                <Tooltip formatter={v => [`£${Number(v).toFixed(2)}`, 'Revenue']} />
                <Bar dataKey="revenue" fill="#2563EB" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function ReportDisplay({ report }) {
  return (
    <div className="text-sm space-y-1 font-mono bg-gray-50 rounded-lg p-4">
      <div className="flex justify-between"><span className="text-gray-500">Transactions</span><span className="font-bold">{report.transactionCount}</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Net Sales</span><span className="font-bold">£{Number(report.netSales || 0).toFixed(2)}</span></div>
      <div className="flex justify-between"><span className="text-gray-500">VAT</span><span>£{Number(report.totalVat || 0).toFixed(2)}</span></div>
      <div className="flex justify-between border-t pt-1 mt-1"><span className="text-gray-500">Gross</span><span className="font-bold">£{Number(report.grossSales || 0).toFixed(2)}</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Cash</span><span>£{Number(report.cashTotal || 0).toFixed(2)}</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Card</span><span>£{Number(report.cardTotal || 0).toFixed(2)}</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Voids</span><span className="text-red-500">{report.voidCount} (£{Number(report.voidTotal || 0).toFixed(2)})</span></div>
      <div className="flex justify-between"><span className="text-gray-500">Refunds</span><span className="text-orange-500">{report.refundCount} (£{Number(report.refundTotal || 0).toFixed(2)})</span></div>
    </div>
  );
}
