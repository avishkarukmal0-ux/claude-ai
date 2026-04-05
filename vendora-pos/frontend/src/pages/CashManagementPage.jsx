import React, { useState, useEffect, useCallback } from 'react';
import { DollarSign, ArrowDownCircle, ArrowUpCircle, AlertTriangle, RefreshCw, ChevronDown, X } from 'lucide-react';
import * as cashSvc from '../services/cashDrawer';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const DENOMS = [
  { label: '£50', value: 50 },
  { label: '£20', value: 20 },
  { label: '£10', value: 10 },
  { label: '£5', value: 5 },
  { label: '£2', value: 2 },
  { label: '£1', value: 1 },
  { label: '50p', value: 0.5 },
  { label: '20p', value: 0.2 },
  { label: '10p', value: 0.1 },
  { label: '5p', value: 0.05 },
  { label: '2p', value: 0.02 },
  { label: '1p', value: 0.01 },
];

function DenomCount({ counts, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {DENOMS.map(d => (
        <div key={d.value} className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 w-8 text-right">{d.label}</span>
          <input
            type="number" min="0"
            className="flex-1 border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary"
            value={counts[d.value] || ''}
            onChange={e => onChange({ ...counts, [d.value]: Number(e.target.value) || 0 })}
          />
          <span className="text-xs text-gray-400 w-14 text-right">
            £{((counts[d.value] || 0) * d.value).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

function SafeDropModal({ onClose, onDone, tillId }) {
  const [counts, setCounts] = useState({});
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const total = DENOMS.reduce((s, d) => s + (counts[d.value] || 0) * d.value, 0);

  async function handleSubmit() {
    if (total <= 0) { toast.error('Enter denominations'); return; }
    setSaving(true);
    try {
      await cashSvc.safeDrop({ tillId, amount: total, denominations: counts, note });
      toast.success(`Safe drop of £${total.toFixed(2)} recorded`);
      onDone();
    } catch {
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold">Safe Drop</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <DenomCount counts={counts} onChange={setCounts} />
          <div className="flex justify-between font-bold text-lg border-t pt-3">
            <span>Total</span>
            <span className="text-green-600">£{total.toFixed(2)}</span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note (optional)</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button onClick={handleSubmit} disabled={saving} className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Recording…' : 'Record Safe Drop'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PayoutModal({ onClose, onDone, tillId }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await cashSvc.payout({ tillId, amount: Number(amount), reason, supervisorPin: pin });
      toast.success(`Payout of £${amount} recorded`);
      onDone();
    } catch {
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold">Cash Payout</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (£) *</label>
            <input type="number" step="0.01" min="0.01" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={reason} onChange={e => setReason(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supervisor PIN</label>
            <input type="password" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={pin} onChange={e => setPin(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
              {saving ? 'Recording…' : 'Record Payout'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const ACTIVITY_COLORS = {
  opening_float: 'text-blue-600 bg-blue-50',
  cash_sale: 'text-green-600 bg-green-50',
  cash_refund: 'text-orange-600 bg-orange-50',
  safe_drop: 'text-purple-600 bg-purple-50',
  payout: 'text-red-600 bg-red-50',
  drawer_open: 'text-gray-600 bg-gray-100',
};

export default function CashManagementPage() {
  const { user } = useAuth();
  const [tillId, setTillId] = useState('TILL-1');
  const [state, setState] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'safedrop' | 'payout'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [stateRes, actRes] = await Promise.allSettled([
        cashSvc.getState(tillId),
        cashSvc.getActivityLog(tillId),
      ]);
      if (stateRes.status === 'fulfilled') setState(stateRes.value?.drawer || stateRes.value);
      if (actRes.status === 'fulfilled') setActivity(actRes.value?.activities || actRes.value || []);
    } finally {
      setLoading(false);
    }
  }, [tillId]);

  useEffect(() => { load(); }, [load]);

  function onModalDone() { setModal(null); load(); }

  const currentBalance = state?.currentBalance ?? state?.cashBalance ?? 0;
  const targetFloat = state?.targetFloat ?? 150;
  const excess = Math.max(0, currentBalance - targetFloat);
  const needsDrop = excess > 50;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cash Management</h1>
          <p className="text-sm text-gray-500 mt-1">Till float, safe drops and cash activity</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
            <span className="text-sm text-gray-500">Till:</span>
            <select className="text-sm font-medium focus:outline-none" value={tillId} onChange={e => setTillId(e.target.value)}>
              <option>TILL-1</option>
              <option>TILL-2</option>
              <option>TILL-3</option>
            </select>
          </div>
          <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50">
            <RefreshCw size={16} className={loading ? 'animate-spin text-primary' : 'text-gray-500'} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
      ) : (
        <div className="space-y-6">
          {/* Balance cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border p-5">
              <p className="text-sm text-gray-500 mb-1">Current Balance</p>
              <p className={`text-3xl font-bold ${needsDrop ? 'text-orange-600' : 'text-gray-900'}`}>
                £{Number(currentBalance).toFixed(2)}
              </p>
              {needsDrop && (
                <div className="flex items-center gap-1 mt-2 text-orange-600 text-xs font-medium">
                  <AlertTriangle size={12} /> Safe drop recommended
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl border p-5">
              <p className="text-sm text-gray-500 mb-1">Target Float</p>
              <p className="text-3xl font-bold text-gray-900">£{Number(targetFloat).toFixed(2)}</p>
              <p className="text-xs text-gray-400 mt-2">Minimum operational float</p>
            </div>
            <div className="bg-white rounded-xl border p-5">
              <p className="text-sm text-gray-500 mb-1">Excess Cash</p>
              <p className={`text-3xl font-bold ${excess > 0 ? 'text-purple-600' : 'text-gray-400'}`}>
                £{Number(excess).toFixed(2)}
              </p>
              <p className="text-xs text-gray-400 mt-2">Above target float</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => setModal('safedrop')}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700"
            >
              <ArrowDownCircle size={18} /> Safe Drop
            </button>
            <button
              onClick={() => setModal('payout')}
              className="flex items-center gap-2 bg-orange-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-600"
            >
              <ArrowUpCircle size={18} /> Payout
            </button>
          </div>

          {/* Activity log */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <h3 className="font-semibold text-gray-800 text-sm">Today's Cash Activity</h3>
              <span className="text-xs text-gray-400">{activity.length} events</span>
            </div>
            {activity.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">No activity recorded today</div>
            ) : (
              <div className="divide-y max-h-96 overflow-y-auto">
                {activity.map((a, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTIVITY_COLORS[a.type] || 'bg-gray-100 text-gray-600'}`}>
                        {(a.type || '').replace(/_/g, ' ')}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{a.description || a.note || a.reason || '—'}</p>
                        <p className="text-xs text-gray-400">{dayjs(a.createdAt).format('HH:mm')} · {a.staffName || a.staff?.firstName || 'System'}</p>
                      </div>
                    </div>
                    <span className={`text-sm font-bold ${a.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {a.amount >= 0 ? '+' : ''}£{Math.abs(a.amount).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {modal === 'safedrop' && <SafeDropModal tillId={tillId} onClose={() => setModal(null)} onDone={onModalDone} />}
      {modal === 'payout' && <PayoutModal tillId={tillId} onClose={() => setModal(null)} onDone={onModalDone} />}
    </div>
  );
}
