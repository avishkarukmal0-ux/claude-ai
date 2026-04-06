import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Eye, ShieldAlert, TrendingDown, Zap, RefreshCw, Plus, X, Clock } from 'lucide-react';
import * as lpSvc from '../services/lossPrevention';
import api from '../services/api';
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

// Transaction Replay Modal (#43)
function TransactionReplayModal({ saleId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cctvRef, setCctvRef] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/loss-prevention/transaction-replay/${saleId}`)
      .then(r => { setData(r.data); setCctvRef(r.data.sale?.cctvReference || ''); })
      .catch(() => toast.error('Failed to load transaction'))
      .finally(() => setLoading(false));
  }, [saleId]);

  async function saveCctv() {
    setSaving(true);
    try {
      await api.put(`/loss-prevention/transaction-replay/${saleId}/cctv`, { cctvReference: cctvRef });
      toast.success('CCTV reference saved');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-gray-900">Transaction Replay</h2>
            {data && <p className="text-sm text-gray-500">Receipt #{data.sale.receiptNumber}</p>}
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
        ) : data ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500 text-xs">Staff</p>
                <p className="font-medium">{data.sale.staffName}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500 text-xs">Till</p>
                <p className="font-medium">{data.sale.tillId}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500 text-xs">Total</p>
                <p className="font-bold text-green-700">£{Number(data.sale.total).toFixed(2)}</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2"><Clock size={14} /> Scan Timeline</h3>
              <div className="space-y-2">
                {data.timeline.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5 text-sm">
                    <span className="w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center text-xs font-bold">{item.seq}</span>
                    <span className="text-gray-400 font-mono text-xs w-16">{dayjs(item.time).format('HH:mm:ss')}</span>
                    <div className="flex-1">
                      <span className="font-medium">{item.productName}</span>
                      <span className="text-gray-400 ml-2 text-xs">{item.barcode}</span>
                    </div>
                    <span className="text-gray-600">×{item.quantity}</span>
                    <span className="font-mono font-medium">£{Number(item.lineTotal).toFixed(2)}</span>
                    {item.ageVerified && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">✓ Age</span>}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CCTV Reference</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="e.g. CAM2-2024-01-15-14:32"
                  value={cctvRef}
                  onChange={e => setCctvRef(e.target.value)}
                />
                <button onClick={saveCctv} disabled={saving} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-center py-8 text-gray-400">Transaction not found</p>
        )}
      </div>
    </div>
  );
}

// ── Lone Worker Panel ────────────────────────────────────────────────────────
function LoneWorkerPanel() {
  const [session, setSession] = useState(null); // active session
  const [loading, setLoading] = useState(false);
  const [intervalMin, setIntervalMin] = useState(30);
  const [tillId, setTillId] = useState('TILL-1');
  const [elapsed, setElapsed] = useState(0);

  // Tick every minute to show elapsed time
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - new Date(session.startedAt)) / 60000)), 30000);
    setElapsed(Math.floor((Date.now() - new Date(session.startedAt)) / 60000));
    return () => clearInterval(t);
  }, [session]);

  async function startSession() {
    setLoading(true);
    try {
      const { data } = await api.post('/loss-prevention/lone-worker/start', { tillId, settings: { checkIntervalMinutes: intervalMin } });
      setSession({ ...(data.session || data), startedAt: new Date().toISOString() });
      toast.success(`Lone worker session started — check-in every ${intervalMin} min`);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to start session');
    } finally { setLoading(false); }
  }

  async function checkin() {
    if (!session) return;
    setLoading(true);
    try {
      await api.post('/loss-prevention/lone-worker/checkin');
      setSession(s => ({ ...s, lastCheckin: new Date().toISOString() }));
      toast.success('Check-in recorded — stay safe!');
    } catch { toast.error('Check-in failed'); } finally { setLoading(false); }
  }

  async function endSession() {
    if (!session) return;
    setLoading(true);
    try {
      await api.post('/loss-prevention/lone-worker/end');
      setSession(null);
      toast.success('Lone worker session ended');
    } catch { toast.error('Failed to end session'); } finally { setLoading(false); }
  }

  const minutesSinceCheckin = session?.lastCheckin
    ? Math.floor((Date.now() - new Date(session.lastCheckin)) / 60000)
    : null;
  const overdueCheckin = minutesSinceCheckin !== null && minutesSinceCheckin > intervalMin;

  if (session) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <div className={`rounded-xl border-2 p-6 text-center ${overdueCheckin ? 'border-red-400 bg-red-50' : 'border-green-400 bg-green-50'}`}>
          <div className="text-5xl mb-3">{overdueCheckin ? '⚠️' : '🟢'}</div>
          <h3 className="text-xl font-bold text-gray-900 mb-1">
            {overdueCheckin ? 'CHECK-IN OVERDUE' : 'Session Active'}
          </h3>
          <p className="text-sm text-gray-600 mb-1">Till: {session.tillId} · Running {elapsed} min</p>
          {session.lastCheckin && (
            <p className={`text-sm font-medium ${overdueCheckin ? 'text-red-700' : 'text-green-700'}`}>
              Last check-in: {dayjs(session.lastCheckin).format('HH:mm')} ({minutesSinceCheckin} min ago)
            </p>
          )}
          <p className="text-xs text-gray-500 mt-1">Check-in interval: {intervalMin} min</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={checkin} disabled={loading}
            className="py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 text-lg">
            ✅ Check In
          </button>
          <button onClick={endSession} disabled={loading}
            className="py-4 bg-gray-600 text-white font-bold rounded-xl hover:bg-gray-700 disabled:opacity-50">
            🔴 End Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      <div className="bg-white rounded-xl border p-6 space-y-4">
        <div className="text-center">
          <div className="text-4xl mb-2">👤</div>
          <h3 className="text-lg font-bold text-gray-900">Start Lone Worker Session</h3>
          <p className="text-sm text-gray-500 mt-1">Automated check-ins with missed-check alert to manager</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Till ID</label>
          <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={tillId} onChange={e => setTillId(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Interval (minutes)</label>
          <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={intervalMin} onChange={e => setIntervalMin(Number(e.target.value))}>
            {[15, 20, 30, 45, 60].map(m => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </div>
        <button onClick={startSession} disabled={loading}
          className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50">
          {loading ? 'Starting…' : '🟢 Start Session'}
        </button>
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
  const [replaySearch, setReplaySearch] = useState('');
  const [replaySales, setReplaySales] = useState([]);
  const [replayLoading, setReplayLoading] = useState(false);
  const [replaySaleId, setReplaySaleId] = useState(null);

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

  const searchReplaySales = useCallback(async () => {
    if (!replaySearch.trim()) return;
    setReplayLoading(true);
    try {
      const { data } = await api.get('/sales', { params: { search: replaySearch.trim(), limit: 20 } });
      setReplaySales(data.sales || data || []);
    } catch { toast.error('Search failed'); }
    finally { setReplayLoading(false); }
  }, [replaySearch]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'incidents', label: `Incidents ${incidents.length > 0 ? `(${incidents.length})` : ''}` },
    { id: 'patterns', label: 'Scan Patterns' },
    { id: 'replay', label: '🎬 Transaction Replay' },
    { id: 'lone-worker', label: '👤 Lone Worker' },
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

          {tab === 'replay' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Search by receipt number, staff name..."
                  value={replaySearch}
                  onChange={e => setReplaySearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchReplaySales()}
                />
                <button onClick={searchReplaySales} disabled={replayLoading} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50">
                  {replayLoading ? '…' : 'Search'}
                </button>
              </div>
              {replaySales.length > 0 && (
                <div className="bg-white rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Receipt</th>
                        <th className="px-4 py-3 text-left">Date</th>
                        <th className="px-4 py-3 text-left">Staff</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {replaySales.map(s => (
                        <tr key={s._id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono font-medium">{s.receiptNumber}</td>
                          <td className="px-4 py-3 text-gray-500">{dayjs(s.createdAt).format('DD/MM/YYYY HH:mm')}</td>
                          <td className="px-4 py-3">{s.staffName}</td>
                          <td className="px-4 py-3 text-right font-medium">£{Number(s.total).toFixed(2)}</td>
                          <td className="px-4 py-3 text-center">
                            <button onClick={() => setReplaySaleId(s._id)} className="bg-primary text-white px-3 py-1 rounded-lg text-xs font-medium hover:bg-primary-600">
                              Replay
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {replaySales.length === 0 && replaySearch && !replayLoading && (
                <p className="text-center py-8 text-gray-400">No transactions found. Try searching by receipt number.</p>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'lone-worker' && <LoneWorkerPanel />}

      {showIncidentModal && (
        <IncidentModal
          onClose={() => setShowIncidentModal(false)}
          onSaved={() => { setShowIncidentModal(false); load(); }}
        />
      )}
      {replaySaleId && (
        <TransactionReplayModal saleId={replaySaleId} onClose={() => setReplaySaleId(null)} />
      )}
    </div>
  );
}
