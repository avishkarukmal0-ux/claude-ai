import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const REASONS = {
  no_id: 'No ID presented',
  id_invalid: 'ID invalid/expired',
  underage: 'Visibly underage',
  no_id_present: 'ID not present',
  other: 'Other',
};

export default function Challenge25Page() {
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [to, setTo] = useState(dayjs().format('YYYY-MM-DD'));

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/challenge25/stats');
      setStats(data);
    } catch { toast.error('Failed to load stats'); }
    finally { setLoading(false); }
  }, []);

  const loadAudit = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/challenge25/audit', { params: { from, to, limit: 200 } });
      setAudit(data.refusals || []);
      setAuditTotal(data.total || 0);
    } catch { toast.error('Failed to load audit'); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => {
    if (tab === 'stats') loadStats();
    if (tab === 'audit') loadAudit();
  }, [tab, loadStats, loadAudit]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Challenge 25</h1>
        <p className="text-sm text-gray-500 mt-1">Age verification compliance & reporting</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b">
        {[['stats', '📊 Statistics'], ['audit', '📋 Compliance Audit']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${tab === key ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>}

      {/* Stats tab (#26) */}
      {!loading && tab === 'stats' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border p-5">
              <p className="text-sm text-gray-500 mb-1">Refusals This Week</p>
              <p className="text-4xl font-bold text-red-600">{stats.thisWeek?.total || 0}</p>
            </div>
            <div className="bg-white rounded-xl border p-5">
              <p className="text-sm text-gray-500 mb-1">Refusals This Month</p>
              <p className="text-4xl font-bold text-orange-600">{stats.thisMonth?.total || 0}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* By staff this week */}
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <h3 className="font-semibold text-gray-800 text-sm">By Staff (This Week)</h3>
              </div>
              {!stats.thisWeek?.byStaff?.length ? (
                <p className="text-center py-6 text-gray-400 text-sm">No refusals this week</p>
              ) : (
                <div className="divide-y">
                  {stats.thisWeek.byStaff.map((s, i) => (
                    <div key={i} className="flex justify-between px-4 py-3">
                      <span className="text-sm font-medium text-gray-800">{s._id}</span>
                      <span className="text-sm font-bold text-red-600">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* By reason this week */}
            <div className="bg-white rounded-xl border overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <h3 className="font-semibold text-gray-800 text-sm">By Reason (This Week)</h3>
              </div>
              {!stats.thisWeek?.byReason?.length ? (
                <p className="text-center py-6 text-gray-400 text-sm">No refusals this week</p>
              ) : (
                <div className="divide-y">
                  {stats.thisWeek.byReason.map((r, i) => (
                    <div key={i} className="flex justify-between px-4 py-3">
                      <span className="text-sm text-gray-700">{REASONS[r._id] || r._id}</span>
                      <span className="text-sm font-bold text-orange-600">{r.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* By staff this month */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b">
              <h3 className="font-semibold text-gray-800 text-sm">By Staff (This Month)</h3>
            </div>
            {!stats.thisMonth?.byStaff?.length ? (
              <p className="text-center py-6 text-gray-400 text-sm">No refusals this month</p>
            ) : (
              <div className="divide-y">
                {stats.thisMonth.byStaff.map((s, i) => (
                  <div key={i} className="flex justify-between px-4 py-3">
                    <span className="text-sm font-medium text-gray-800">{s._id}</span>
                    <span className="text-sm font-bold text-red-600">{s.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Audit tab (#25) */}
      {!loading && tab === 'audit' && (
        <div className="space-y-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <button onClick={loadAudit} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-600">Load Report</button>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
            <p className="text-sm text-blue-800 font-medium">
              📋 {auditTotal} refusals recorded — suitable for HMRC/licensing compliance audit
            </p>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b flex justify-between">
              <h3 className="font-semibold text-gray-800 text-sm">Age Refusal Log</h3>
              <span className="text-xs text-gray-400">{audit.length} shown</span>
            </div>
            {audit.length === 0 ? (
              <p className="text-center py-8 text-gray-400 text-sm">No refusals in selected period</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">Date/Time</th>
                      <th className="px-4 py-3 text-left">Staff</th>
                      <th className="px-4 py-3 text-left">Product</th>
                      <th className="px-4 py-3 text-left">Min Age</th>
                      <th className="px-4 py-3 text-left">Reason</th>
                      <th className="px-4 py-3 text-left">Till</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {audit.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">{dayjs(r.occurredAt).format('DD/MM/YYYY HH:mm')}</td>
                        <td className="px-4 py-3">{r.staff?.displayName || r.staffName}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{r.productName}</p>
                          <p className="text-xs text-gray-400">{r.productBarcode}</p>
                        </td>
                        <td className="px-4 py-3">{r.minimumAge}+</td>
                        <td className="px-4 py-3">{REASONS[r.refusalReason] || r.refusalReason}</td>
                        <td className="px-4 py-3 text-gray-500">{r.tillId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
