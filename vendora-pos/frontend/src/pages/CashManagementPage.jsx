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

// Blind Cash Count Modal (#48)
function BlindCountModal({ tillId, onClose, onDone }) {
  const [counts, setCounts] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const counted = DENOMS.reduce((s, d) => s + (counts[d.value] || 0) * d.value, 0);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const { data } = await import('../services/api').then(m => m.default.post('/cash-drawer/blind-count', {
        tillId,
        denominations: counts,
        countedTotal: counted,
      }));
      setResult(data);
    } catch {
      const cashSvc = await import('../services/cashDrawer');
      try {
        const resp = await cashSvc.default?.blindCount?.({ tillId, denominations: counts, countedTotal: counted });
        setResult(resp);
      } catch {
        // Fallback: show local result without backend
        setResult({ countedTotal: counted, expected: null, variance: null });
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    const isExact = result.variance === 0;
    const isOver = result.variance > 0;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm text-center p-8">
          <div className="text-5xl mb-4">{isExact ? '🎯' : isOver ? '📈' : '📉'}</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Count Complete</h2>
          <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Counted</span>
              <span className="font-bold font-mono">£{counted.toFixed(2)}</span>
            </div>
            {result.expected !== null && result.expected !== undefined && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">Expected</span>
                  <span className="font-mono">£{Number(result.expected).toFixed(2)}</span>
                </div>
                <div className={`flex justify-between font-bold ${isExact ? 'text-green-600' : isOver ? 'text-blue-600' : 'text-red-600'}`}>
                  <span>Variance</span>
                  <span className="font-mono">{result.variance > 0 ? '+' : ''}£{Number(result.variance).toFixed(2)}</span>
                </div>
              </>
            )}
          </div>
          <button onClick={onDone} className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary-600">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold">Blind Cash Count</h2>
            <p className="text-xs text-gray-500 mt-0.5">Count cash without seeing the expected total</p>
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <DenomCount counts={counts} onChange={setCounts} />
          <div className="flex justify-between font-bold text-xl border-t pt-4">
            <span>Counted Total</span>
            <span className="text-green-600">£{counted.toFixed(2)}</span>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button onClick={handleSubmit} disabled={submitting || counted === 0} className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {submitting ? 'Submitting…' : 'Submit Count'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Shift Handover Modal (#P2)
function ShiftHandoverModal({ tillId, onClose, onDone }) {
  const [step, setStep] = useState('form'); // form | outgoing_pin | incoming_pin | done
  const [staff, setStaff] = useState([]);
  const [outgoing, setOutgoing] = useState('');
  const [incoming, setIncoming] = useState('');
  const [handoverId, setHandoverId] = useState(null);
  const [outPin, setOutPin] = useState('');
  const [inPin, setInPin] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    import('../services/api').then(m => m.default.get('/staff?active=true')).then(r => {
      setStaff(r.data?.staff || r.data || []);
    }).catch(() => {});
  }, []);

  async function initiateHandover() {
    if (!incoming) { toast.error('Select incoming staff'); return; }
    setSaving(true);
    try {
      const api = (await import('../services/api')).default;
      const r = await api.post('/cash-drawer/handover/initiate', { tillId, incomingStaffId: incoming });
      setHandoverId(r.data.handover?._id || r.data._id);
      setStep('outgoing_pin');
      toast.success('Handover initiated — outgoing staff please enter PIN');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to initiate handover');
    } finally { setSaving(false); }
  }

  async function confirmOutgoing() {
    if (!outPin) return;
    setSaving(true);
    try {
      const api = (await import('../services/api')).default;
      await api.post(`/cash-drawer/handover/${handoverId}/confirm-outgoing`, { pin: outPin });
      setOutPin('');
      setStep('incoming_pin');
      toast.success('Outgoing confirmed — incoming staff please enter PIN');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'PIN incorrect');
    } finally { setSaving(false); }
  }

  async function confirmIncoming() {
    if (!inPin) return;
    setSaving(true);
    try {
      const api = (await import('../services/api')).default;
      await api.post(`/cash-drawer/handover/${handoverId}/confirm-incoming`, { pin: inPin });
      setStep('done');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'PIN incorrect');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold">Shift Handover</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="p-6">
          {step === 'done' ? (
            <div className="text-center py-4">
              <div className="text-5xl mb-3">✅</div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Handover Complete</h3>
              <p className="text-sm text-gray-500 mb-6">Till {tillId} has been handed over successfully.</p>
              <button onClick={onDone} className="w-full bg-primary text-white py-2.5 rounded-lg font-bold hover:bg-primary/90">Done</button>
            </div>
          ) : step === 'form' ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">You (current user) are the outgoing staff. Select who is taking over.</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Incoming Staff</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={incoming} onChange={e => setIncoming(e.target.value)}>
                  <option value="">— Select —</option>
                  {staff.map(s => <option key={s._id} value={s._id}>{s.displayName || `${s.firstName} ${s.lastName}`}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Till</label>
                <p className="text-sm font-semibold text-gray-900">{tillId}</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button onClick={initiateHandover} disabled={saving || !incoming} className="flex-1 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {saving ? 'Starting…' : 'Start Handover'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                {step === 'outgoing_pin' ? '👤 Outgoing staff: enter your 4-digit PIN' : '👤 Incoming staff: enter your 4-digit PIN'}
              </p>
              <input
                type="password" maxLength={6}
                className="w-full border-2 border-gray-300 rounded-xl px-4 py-4 text-3xl font-mono tracking-widest text-center focus:outline-none focus:border-primary"
                value={step === 'outgoing_pin' ? outPin : inPin}
                onChange={e => step === 'outgoing_pin' ? setOutPin(e.target.value) : setInPin(e.target.value)}
                placeholder="••••"
                autoFocus
              />
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button
                  onClick={step === 'outgoing_pin' ? confirmOutgoing : confirmIncoming}
                  disabled={saving || (step === 'outgoing_pin' ? !outPin : !inPin)}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'Verifying…' : 'Confirm PIN'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CashManagementPage() {
  const { user } = useAuth();
  const [tillId, setTillId] = useState('TILL-1');
  const [state, setState] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // 'safedrop' | 'payout' | 'blindcount' | 'handover'

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
  const lastVariance = state?.lastVariance ?? null;
  const varianceThreshold = state?.varianceThreshold ?? 5;
  const hasVarianceAlert = lastVariance !== null && Math.abs(lastVariance) > varianceThreshold;

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
          {/* Variance alert banner */}
          {hasVarianceAlert && (
            <div className="bg-red-50 border border-red-300 rounded-xl px-4 py-3 flex items-center gap-3">
              <AlertTriangle size={20} className="text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-red-800">Cash Variance Alert</p>
                <p className="text-xs text-red-600">
                  Last count showed a {lastVariance > 0 ? 'surplus' : 'shortage'} of £{Math.abs(lastVariance).toFixed(2)} — above the £{varianceThreshold.toFixed(2)} threshold.
                  Supervisor review required.
                </p>
              </div>
            </div>
          )}
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
          <div className="flex flex-wrap gap-3">
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
            <button
              onClick={() => setModal('blindcount')}
              className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-700"
            >
              🙈 Blind Count
            </button>
            <button
              onClick={() => setModal('handover')}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              🔄 Shift Handover
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
      {modal === 'blindcount' && <BlindCountModal tillId={tillId} onClose={() => setModal(null)} onDone={onModalDone} />}
      {modal === 'handover' && <ShiftHandoverModal tillId={tillId} onClose={() => setModal(null)} onDone={onModalDone} />}
    </div>
  );
}
