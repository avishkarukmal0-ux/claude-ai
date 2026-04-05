import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Eye, ShieldAlert, TrendingDown, Zap, RefreshCw, Plus, X } from 'lucide-react';
import * as lpSvc from '../services/lossPrevention';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const SEVERITY_COLORS = {
  low: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  medium: 'bg-orange-50 text-orange-700 border-orange-200',
  high: 'bg-red-50 text-red-700 border-red-200',
  critical: 'bg-red-100 text-red-800 border-red-300',
};

function IncidentModal({ onClose, onSaved }) {
  const [form, setForm] = useState({ type: 'theft', severity: 'medium', description: '', value: '' });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await lpSvc.logIncident(form);
      toast.success('Incident logged');
      onSaved();
    } catch {
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold">Log Incident</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.type} onChange={e => set('type', e.target.value)}>
              <option value="theft">Theft</option>
              <option value="shoplifting">Shoplifting</option>
              <option value="staff_fraud">Staff Fraud</option>
              <option value="till_discrepancy">Till Discrepancy</option>
              <option value="refund_abuse">Refund Abuse</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.severity} onChange={e => set('severity', e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Value (£)</label>
            <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.value} onChange={e => set('value', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" rows={3} value={form.description} onChange={e => set('description', e.target.value)} required />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Log Incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LossPreventionPage() {
  const [tab, setTab] = useState('dashboard');
  const [dashboard, setDashboard] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showIncidentModal, setShowIncidentModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, incRes, patRes] = await Promise.allSettled([
        lpSvc.getDashboard(),
        lpSvc.getIncidents(),
        lpSvc.getScanPatterns(),
      ]);
      if (dashRes.status === 'fulfilled') setDashboard(dashRes.value);
      if (incRes.status === 'fulfilled') setIncidents(incRes.value?.incidents || incRes.value || []);
      if (patRes.status === 'fulfilled') setPatterns(patRes.value?.patterns || patRes.value || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'incidents', label: `Incidents ${incidents.length > 0 ? `(${incidents.length})` : ''}` },
    { id: 'patterns', label: 'Scan Patterns' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Loss Prevention</h1>
          <p className="text-sm text-gray-500 mt-1">Incidents, patterns and alerts</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50">
            <RefreshCw size={16} className={loading ? 'animate-spin text-primary' : 'text-gray-500'} />
          </button>
          <button onClick={() => setShowIncidentModal(true)} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700">
            <Plus size={18} /> Log Incident
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-red-600 border-t-transparent" /></div>
      ) : (
        <>
          {tab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border p-5">
                  <div className="flex items-center gap-2 mb-2"><AlertTriangle size={18} className="text-red-500" /><span className="text-sm text-gray-500">Open Incidents</span></div>
                  <p className="text-3xl font-bold text-red-600">{dashboard?.openIncidents ?? incidents.filter(i => i.status !== 'resolved').length}</p>
                </div>
                <div className="bg-white rounded-xl border p-5">
                  <div className="flex items-center gap-2 mb-2"><TrendingDown size={18} className="text-orange-500" /><span className="text-sm text-gray-500">Shrinkage Today</span></div>
                  <p className="text-3xl font-bold text-orange-600">£{Number(dashboard?.shrinkageToday ?? 0).toFixed(2)}</p>
                </div>
                <div className="bg-white rounded-xl border p-5">
                  <div className="flex items-center gap-2 mb-2"><Zap size={18} className="text-yellow-500" /><span className="text-sm text-gray-500">Pattern Alerts</span></div>
                  <p className="text-3xl font-bold text-yellow-600">{dashboard?.patternAlerts ?? patterns.length}</p>
                </div>
                <div className="bg-white rounded-xl border p-5">
                  <div className="flex items-center gap-2 mb-2"><Eye size={18} className="text-purple-500" /><span className="text-sm text-gray-500">Watchlist</span></div>
                  <p className="text-3xl font-bold text-purple-600">{dashboard?.watchlistCount ?? 0}</p>
                </div>
              </div>

              {incidents.filter(i => i.severity === 'high' || i.severity === 'critical').length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <h3 className="font-semibold text-red-800 mb-3 flex items-center gap-2"><ShieldAlert size={16} /> High Priority Incidents</h3>
                  <div className="space-y-2">
                    {incidents.filter(i => i.severity === 'high' || i.severity === 'critical').slice(0, 3).map(inc => (
                      <div key={inc._id} className="flex items-start justify-between bg-white rounded-lg p-3 border border-red-100">
                        <div>
                          <p className="text-sm font-medium text-gray-900 capitalize">{inc.type?.replace(/_/g, ' ')} — {inc.description}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{dayjs(inc.createdAt).format('DD/MM HH:mm')}</p>
                        </div>
                        {inc.value > 0 && <span className="text-sm font-bold text-red-600">£{Number(inc.value).toFixed(2)}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'incidents' && (
            <div className="bg-white rounded-xl border overflow-hidden">
              {incidents.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <ShieldAlert size={40} className="mx-auto mb-2 opacity-30" />
                  <p>No incidents logged</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Type</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Description</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-600">Severity</th>
                      <th className="text-right px-4 py-3 font-semibold text-gray-600">Value</th>
                      <th className="text-left px-4 py-3 font-semibold text-gray-600">Date</th>
                      <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {incidents.map(inc => (
                      <tr key={inc._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium capitalize">{inc.type?.replace(/_/g, ' ')}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{inc.description}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${SEVERITY_COLORS[inc.severity] || ''}`}>
                            {inc.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-red-600">
                          {inc.value > 0 ? `£${Number(inc.value).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{dayjs(inc.createdAt).format('DD/MM/YYYY HH:mm')}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${inc.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {inc.status || 'open'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'patterns' && (
            <div className="space-y-3">
              {patterns.length === 0 ? (
                <div className="bg-white rounded-xl border text-center py-12 text-gray-400">
                  <Zap size={40} className="mx-auto mb-2 opacity-30" />
                  <p>No suspicious patterns detected</p>
                </div>
              ) : patterns.map((p, i) => (
                <div key={i} className={`bg-white rounded-xl border p-4 border-l-4 ${p.severity === 'high' ? 'border-l-red-500' : 'border-l-orange-400'}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{p.patternType?.replace(/_/g, ' ') || p.type}</p>
                      <p className="text-sm text-gray-500 mt-0.5">{p.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">{p.saleCount} txns</p>
                      <p className="text-xs text-gray-400">{dayjs(p.detectedAt || p.createdAt).format('HH:mm')}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showIncidentModal && (
        <IncidentModal
          onClose={() => setShowIncidentModal(false)}
          onSaved={() => { setShowIncidentModal(false); load(); }}
        />
      )}
    </div>
  );
}
