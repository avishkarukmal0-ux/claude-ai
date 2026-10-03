import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, User, Star, ChevronLeft, ChevronRight, X, Phone, Mail, PieChart, CreditCard } from 'lucide-react';
import * as customersSvc from '../services/customers';
import api from '../services/api';
import toast from 'react-hot-toast';

const TIER_COLORS = {
  bronze: 'bg-amber-100 text-amber-700',
  silver: 'bg-gray-200 text-gray-600',
  gold: 'bg-yellow-100 text-yellow-700',
  platinum: 'bg-purple-100 text-purple-700',
};

function CustomerModal({ customer, onClose, onSaved }) {
  const isEdit = !!customer?._id;
  const [form, setForm] = useState(customer ? {
    firstName: customer.firstName || '',
    lastName: customer.lastName || '',
    phone: customer.phone || '',
    email: customer.email || '',
    dateOfBirth: customer.dateOfBirth ? customer.dateOfBirth.slice(0, 10) : '',
    notes: customer.notes || '',
    marketing: { emailOptIn: customer.marketing?.emailOptIn || false, smsOptIn: customer.marketing?.smsOptIn || false },
  } : {
    firstName: '', lastName: '', phone: '', email: '', dateOfBirth: '', notes: '',
    marketing: { emailOptIn: false, smsOptIn: false },
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await customersSvc.updateCustomer(customer._id, form);
        toast.success('Customer updated');
      } else {
        await customersSvc.createCustomer(form);
        toast.success('Customer added');
      }
      onSaved();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">{isEdit ? 'Edit Customer' : 'Add Customer'}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.firstName} onChange={e => set('firstName', e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.lastName} onChange={e => set('lastName', e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          <div className="pt-2 border-t space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Marketing Preferences</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-primary" checked={form.marketing.emailOptIn} onChange={e => set('marketing', { ...form.marketing, emailOptIn: e.target.checked })} />
              <span className="text-sm text-gray-700">Email marketing opt-in</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-primary" checked={form.marketing.smsOptIn} onChange={e => set('marketing', { ...form.marketing, smsOptIn: e.target.checked })} />
              <span className="text-sm text-gray-700">SMS marketing opt-in</span>
            </label>
          </div>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Customer')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Customer Segmentation Tab (#117)
function SegmentationTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/customers/segments')
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load segments'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>;
  if (!data) return null;

  const tierColors = { bronze: 'bg-amber-100 text-amber-700', silver: 'bg-gray-200 text-gray-600', gold: 'bg-yellow-100 text-yellow-700', platinum: 'bg-purple-100 text-purple-700' };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b"><h3 className="font-semibold text-sm text-gray-800">By Loyalty Tier</h3></div>
          {(data.byTier || []).map((t, i) => (
            <div key={i} className="flex justify-between items-center px-4 py-3 border-b last:border-0">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${tierColors[t._id] || 'bg-gray-100 text-gray-500'}`}>{t._id || 'none'}</span>
              <div className="text-right">
                <p className="font-bold text-gray-900">{t.count} customers</p>
                <p className="text-xs text-gray-400">Avg spend: £{Number(t.avgSpend || 0).toFixed(0)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b"><h3 className="font-semibold text-sm text-gray-800">Active vs Inactive (30 days)</h3></div>
          {(data.activeVsInactive || []).map((g, i) => (
            <div key={i} className="flex justify-between items-center px-4 py-3 border-b last:border-0">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${g._id === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{g._id}</span>
              <div className="text-right">
                <p className="font-bold text-gray-900">{g.count} customers</p>
                <p className="text-xs text-gray-400">Avg spend: £{Number(g.avgSpend || 0).toFixed(0)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b"><h3 className="font-semibold text-sm text-gray-800">By Total Spend Band</h3></div>
        <div className="divide-y">
          {(data.bySpend || []).map((band, i) => (
            <div key={i} className="flex justify-between px-4 py-3">
              <span className="text-sm text-gray-700">£{band._id === '5000+' ? '5000+' : `${band._id}–${[50,200,500,1000,5000][i] || '...'}`}</span>
              <span className="font-bold text-gray-900">{band.count} customers</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Account Payment Modal (#119)
function AccountPaymentModal({ customer, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post(`/customers/${customer._id}/account/payment`, { amount: Number(amount), method, reference, notes });
      setResult(data);
      toast.success(`Payment of £${amount} recorded`);
    } catch { toast.error('Failed to record payment'); }
    finally { setSaving(false); }
  }

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm text-center p-8">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-xl font-bold mb-2">Payment Recorded</h2>
          <div className="bg-gray-50 rounded-xl p-4 mb-4 text-sm space-y-2">
            <div className="flex justify-between"><span className="text-gray-500">Payment</span><span className="font-mono font-bold text-green-700">£{Number(result.payment).toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">New Balance</span><span className={`font-mono font-bold ${result.newBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>£{Number(result.newBalance).toFixed(2)}</span></div>
          </div>
          <button onClick={onDone} className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold">Record Account Payment</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-sm text-gray-600">{customer.firstName} {customer.lastName}</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (£) *</label>
            <input type="number" step="0.01" min="0.01" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={amount} onChange={e => setAmount(e.target.value)} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={method} onChange={e => setMethod(e.target.value)}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="card">Card</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. BACS ref" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {saving ? 'Recording…' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const [tab, setTab] = useState('customers');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editCustomer, setEditCustomer] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [paymentCustomer, setPaymentCustomer] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await customersSvc.getCustomers({ search: search || undefined, page, limit: 25 });
      setCustomers(res.customers || res.data || []);
      setTotalPages(res.pagination?.totalPages || 1);
      setTotal(res.pagination?.total || 0);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { load(); }, [load]);

  function openAdd() { setEditCustomer(null); setShowModal(true); }
  function openEdit(c) { setEditCustomer(c); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditCustomer(null); }
  function onSaved() { closeModal(); load(); }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-1">{total} registered customers</p>
        </div>
        {tab === 'customers' && (
          <button onClick={openAdd} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90">
            <Plus size={18} /> Add Customer
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6 border-b">
        {[['customers', '👤 Customers'], ['segments', '📊 Segmentation']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${tab === key ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{label}</button>
        ))}
      </div>

      {tab === 'segments' && <SegmentationTab />}

      {tab === 'customers' && (
        <>
        <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Search by name, phone, or email…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
        ) : customers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <User size={48} className="mb-3 opacity-30" />
            <p className="font-medium">No customers found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Contact</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Tier</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Points</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Total Spent</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Visits</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map(c => (
                <tr key={c._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                        {c.firstName?.[0]}{c.lastName?.[0]}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{c.firstName} {c.lastName}</div>
                        <div className="text-xs text-gray-400">{c.customerCode || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.phone && <div className="flex items-center gap-1 text-gray-500"><Phone size={12} />{c.phone}</div>}
                    {c.email && <div className="flex items-center gap-1 text-gray-500"><Mail size={12} />{c.email}</div>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TIER_COLORS[c.loyalty?.tier] || 'bg-gray-100 text-gray-500'}`}>
                      <Star size={10} />{c.loyalty?.tier || 'bronze'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">{(c.loyalty?.points || 0).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">£{(c.stats?.totalSpent || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{c.stats?.visitCount || 0}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {c.account?.isTradeAccount && (
                        <button onClick={() => setPaymentCustomer(c)} className="p-1.5 hover:bg-green-50 rounded text-green-500 hover:text-green-700" title="Record Payment">
                          <CreditCard size={15} />
                        </button>
                      )}
                      <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700">
                        <User size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-40">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-40">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
        </>
      )}

      {showModal && <CustomerModal customer={editCustomer} onClose={closeModal} onSaved={onSaved} />}
      {paymentCustomer && <AccountPaymentModal customer={paymentCustomer} onClose={() => setPaymentCustomer(null)} onDone={() => { setPaymentCustomer(null); load(); }} />}
    </div>
  );
}
