import React, { useState, useEffect } from 'react';
import { Truck, Plus, Edit2, X } from 'lucide-react';
import * as suppliersSvc from '../services/suppliers';
import toast from 'react-hot-toast';

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

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]); const [loading, setLoading] = useState(true);
  const [editSupplier, setEditSupplier] = useState(null); const [showModal, setShowModal] = useState(false);
  async function load() { setLoading(true); try { const r = await suppliersSvc.getSuppliers(); setSuppliers(r.suppliers || r.data || r || []); } catch {} finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-gray-900">Suppliers</h1><p className="text-sm text-gray-500 mt-1">Manage supplier accounts</p></div>
        <button onClick={() => { setEditSupplier(null); setShowModal(true); }} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90"><Plus size={18} /> Add Supplier</button>
      </div>
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
        : suppliers.length === 0 ? <div className="flex flex-col items-center justify-center py-16 text-gray-400"><Truck size={48} className="mb-3 opacity-30" /><p>No suppliers yet</p></div>
        : <table className="w-full text-sm"><thead className="bg-gray-50 border-b"><tr><th className="text-left px-4 py-3 font-semibold text-gray-600">Supplier</th><th className="text-left px-4 py-3 font-semibold text-gray-600">Contact</th><th className="text-left px-4 py-3 font-semibold text-gray-600">Account No.</th><th className="text-right px-4 py-3 font-semibold text-gray-600">Min Order</th><th className="px-4 py-3"></th></tr></thead>
        <tbody className="divide-y">{suppliers.map(s => (<tr key={s._id} className="hover:bg-gray-50"><td className="px-4 py-3"><p className="font-medium text-gray-900">{s.name}</p>{s.contactName && <p className="text-xs text-gray-400">{s.contactName}</p>}</td><td className="px-4 py-3 text-gray-500 text-xs"><div>{s.email}</div><div>{s.phone}</div></td><td className="px-4 py-3 text-gray-500">{s.accountNumber || '—'}</td><td className="px-4 py-3 text-right text-gray-500">{s.minimumOrder > 0 ? `£${s.minimumOrder}` : '—'}</td><td className="px-4 py-3"><button onClick={() => { setEditSupplier(s); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700"><Edit2 size={15} /></button></td></tr>))}</tbody></table>}
      </div>
      {showModal && <SupplierModal supplier={editSupplier} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}
