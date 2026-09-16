import React, { useState, useEffect, useCallback } from 'react';
import { Truck, Plus, Edit2, X, BarChart2, Search } from 'lucide-react';
import * as suppliersSvc from '../services/suppliers';
import api from '../services/api';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

function SupplierModal({ supplier, onClose, onSaved }) {
  const isEdit = !!supplier?._id;
  const [form, setForm] = useState(supplier ? {
    name: supplier.name || '', contactName: supplier.contactName || '',
    email: supplier.email || '', phone: supplier.phone || '',
    accountNumber: supplier.accountNumber || '', minimumOrder: supplier.minimumOrder || 0,
    isActive: supplier.isActive !== false,
  } : { name: '', contactName: '', email: '', phone: '', accountNumber: '', minimumOrder: 0, isActive: true });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true);
    try {
      if (isEdit) { await suppliersSvc.updateSupplier(supplier._id, form); toast.success('Supplier updated'); }
      else { await suppliersSvc.createSupplier(form); toast.success('Supplier added'); }
      onSaved();
    } catch {} finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">{isEdit ? 'Edit Supplier' : 'Add Supplier'}</h2>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label><input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.name} onChange={e => set('name', e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label><input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.contactName} onChange={e => set('contactName', e.target.value)} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Account No.</label><input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.email} onChange={e => set('email', e.target.value)} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input type="tel" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Min Order (£)</label><input type="number" min="0" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.minimumOrder} onChange={e => set('minimumOrder', Number(e.target.value))} /></div>
          </div>
          <div className="flex gap-3 pt-2"><button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button><button type="submit" disabled={saving} className="flex-1 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">{saving ? 'Saving…' : isEdit ? 'Save' : 'Add'}</button></div>
        </form>
      </div>
    </div>
  );
}

// Supplier Performance Modal (#103)
function PerformanceModal({ supplier, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/suppliers/${supplier._id}/performance`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load performance data'))
      .finally(() => setLoading(false));
  }, [supplier._id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="font-bold text-gray-900">Supplier Performance</h2>
            <p className="text-sm text-gray-500">{supplier.name} — last 90 days</p>
          </div>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
        ) : data ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Total Orders', data.performance.totalOrders],
                ['Delivered', data.performance.deliveredOrders],
                ['Pending', data.performance.pendingOrders],
                ['On-Time Rate', data.performance.onTimeDeliveryRate !== null ? `${data.performance.onTimeDeliveryRate}%` : '—'],
              ].map(([label, value]) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
                </div>
              ))}
            </div>
            {data.performance.avgDeliveryVarianceDays !== null && (
              <div className={`rounded-lg px-4 py-3 text-sm ${data.performance.avgDeliveryVarianceDays > 1 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
                <p className="font-medium">Avg Delivery Variance: <span className="font-bold">{data.performance.avgDeliveryVarianceDays > 0 ? '+' : ''}{data.performance.avgDeliveryVarianceDays} days</span></p>
              </div>
            )}
            {data.performance.recentPriceIncreases.length > 0 && (
              <div>
                <p className="font-semibold text-gray-800 mb-2 text-sm">⚠️ Recent Price Increases</p>
                <div className="space-y-1">
                  {data.performance.recentPriceIncreases.map((inc, i) => (
                    <div key={i} className="flex justify-between text-sm bg-orange-50 rounded px-3 py-2">
                      <span className="font-medium">{inc.productName || inc.barcode}</span>
                      <span className="text-orange-700 font-bold">+{inc.pct}% (£{inc.from}→£{inc.to})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.recentOrders.length > 0 && (
              <div>
                <p className="font-semibold text-gray-800 mb-2 text-sm">Recent Orders</p>
                <div className="space-y-1">
                  {data.recentOrders.slice(0, 6).map((o, i) => (
                    <div key={i} className="flex justify-between text-xs bg-gray-50 rounded px-3 py-2">
                      <span>{dayjs(o.createdAt).format('DD/MM/YY')}</span>
                      <span className={`px-2 py-0.5 rounded-full font-medium ${o.status === 'received' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{o.status}</span>
                      <span className="font-mono">£{Number(o.totalCost || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Price Comparison Tab (#91, #92)
function PriceComparisonTab() {
  const [barcode, setBarcode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!barcode.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/suppliers/compare/${barcode.trim()}`);
      setResult(data);
    } catch { toast.error('No price data found'); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Enter barcode to compare prices..."
          value={barcode}
          onChange={e => setBarcode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <button onClick={search} disabled={loading} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
          {loading ? '…' : 'Compare'}
        </button>
      </div>
      {result && (
        <div className="space-y-3">
          {result.cheapest && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm font-bold text-green-800">✅ Best Price: {result.cheapest.supplierName}</p>
              <p className="text-2xl font-black text-green-700 font-mono mt-1">£{Number(result.cheapest.price).toFixed(2)}</p>
            </div>
          )}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b">
              <h3 className="font-semibold text-sm text-gray-800">All Supplier Prices — {result.barcode}</h3>
            </div>
            {result.prices.length === 0 ? (
              <p className="text-center py-6 text-gray-400 text-sm">No price data available for this barcode</p>
            ) : (
              <div className="divide-y">
                {result.prices.map((p, i) => (
                  <div key={i} className={`flex justify-between items-center px-4 py-3 ${i === 0 ? 'bg-green-50' : ''}`}>
                    <div>
                      <p className="font-medium text-sm">{p.supplierName}</p>
                      <p className="text-xs text-gray-400">Updated {dayjs(p.recordedAt).format('DD/MM/YY')}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono font-bold text-lg ${i === 0 ? 'text-green-700' : 'text-gray-700'}`}>£{Number(p.price).toFixed(2)}</p>
                      {i === 0 && <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full">Cheapest</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SuppliersPage() {
  const [tab, setTab] = useState('suppliers');
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editSupplier, setEditSupplier] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [perfSupplier, setPerfSupplier] = useState(null);

  async function load() { setLoading(true); try { const r = await suppliersSvc.getSuppliers(); setSuppliers(r.suppliers || r.data || r || []); } catch {} finally { setLoading(false); } }
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-gray-900">Suppliers</h1><p className="text-sm text-gray-500 mt-1">Manage supplier accounts & prices</p></div>
        {tab === 'suppliers' && <button onClick={() => { setEditSupplier(null); setShowModal(true); }} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"><Plus size={18} /> Add Supplier</button>}
      </div>

      <div className="flex gap-2 mb-6 border-b">
        {[['suppliers', '🏢 Suppliers'], ['compare', '💷 Price Comparison']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${tab === key ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{label}</button>
        ))}
      </div>

      {tab === 'compare' && <PriceComparisonTab />}

      {tab === 'suppliers' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
          : suppliers.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-gray-400"><Truck size={48} className="mb-3 opacity-30" /><p>No suppliers yet</p></div>
          : <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3 font-semibold text-gray-600">Supplier</th><th className="text-left px-4 py-3 font-semibold text-gray-600">Contact</th><th className="text-left px-4 py-3 font-semibold text-gray-600">Account No.</th><th className="text-right px-4 py-3 font-semibold text-gray-600">Min Order</th><th className="px-4 py-3"></th></tr></thead>
          <tbody className="divide-y">{suppliers.map(s => (<tr key={s._id} className="hover:bg-gray-50"><td className="px-4 py-3"><p className="font-medium text-gray-900">{s.name}</p>{s.contactName && <p className="text-xs text-gray-400">{s.contactName}</p>}</td><td className="px-4 py-3 text-gray-500 text-xs"><div>{s.email}</div><div>{s.phone}</div></td><td className="px-4 py-3 text-gray-500">{s.accountNumber || '—'}</td><td className="px-4 py-3 text-right text-gray-500">{s.minimumOrder > 0 ? `£${s.minimumOrder}` : '—'}</td><td className="px-4 py-3"><div className="flex gap-1"><button onClick={() => setPerfSupplier(s)} className="p-1.5 hover:bg-blue-50 rounded text-blue-400 hover:text-blue-600" title="Performance"><BarChart2 size={15} /></button><button onClick={() => { setEditSupplier(s); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700"><Edit2 size={15} /></button></div></td></tr>))}</tbody></table>}
        </div>
      )}

      {showModal && <SupplierModal supplier={editSupplier} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
      {perfSupplier && <PerformanceModal supplier={perfSupplier} onClose={() => setPerfSupplier(null)} />}
    </div>
  );
}
