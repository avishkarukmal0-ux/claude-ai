import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Edit2, Clock, Shield, X } from 'lucide-react';
import * as staffSvc from '../services/staff';
import toast from 'react-hot-toast';
import dayjs from 'dayjs';

const ROLES = ['cashier', 'supervisor', 'manager', 'owner'];
const ROLE_COLORS = {
  cashier: 'bg-gray-100 text-gray-600',
  supervisor: 'bg-blue-100 text-blue-700',
  manager: 'bg-purple-100 text-purple-700',
  owner: 'bg-amber-100 text-amber-700',
};

function StaffModal({ staff, onClose, onSaved }) {
  const isEdit = !!staff?._id;
  const [form, setForm] = useState(staff ? {
    firstName: staff.firstName || '',
    lastName: staff.lastName || '',
    email: staff.email || '',
    phone: staff.phone || '',
    role: staff.role || 'cashier',
    pin: '',
    password: '',
    isActive: staff.isActive !== false,
  } : {
    firstName: '', lastName: '', email: '', phone: '',
    role: 'cashier', pin: '', password: '', isActive: true,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    const payload = { ...form };
    if (!payload.pin) delete payload.pin;
    if (!payload.password) delete payload.password;
    try {
      if (isEdit) {
        await staffSvc.updateStaff(staff._id, payload);
        toast.success('Staff updated');
      } else {
        if (!payload.pin) { toast.error('PIN is required'); setSaving(false); return; }
        await staffSvc.createStaff(payload);
        toast.success('Staff member added');
      }
      onSaved();
    } catch {
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold">{isEdit ? 'Edit Staff' : 'Add Staff'}</h2>
          <button onClick={onClose}><X size={20} /></button>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input type="tel" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.role} onChange={e => set('role', e.target.value)}>
                {ROLES.map(r => <option key={r} className="capitalize">{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN {isEdit ? '(leave blank to keep)' : '*'}</label>
              <input type="password" maxLength={6} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono tracking-widest" value={form.pin} onChange={e => set('pin', e.target.value)} placeholder="4–6 digits" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Password (for login) {isEdit ? '(leave blank to keep)' : ''}</label>
              <input type="password" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={form.password} onChange={e => set('password', e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer pt-2 border-t">
            <input type="checkbox" className="w-4 h-4 accent-primary" checked={!!form.isActive} onChange={e => set('isActive', e.target.checked)} />
            <span className="text-sm font-medium text-gray-700">Active</span>
          </label>
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Add Staff')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function StaffPage() {
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editStaff, setEditStaff] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await staffSvc.getStaff();
      setStaffList(res.staff || res.data || res || []);
    } catch {
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
          <p className="text-sm text-gray-500 mt-1">Manage team members and access</p>
        </div>
        <button onClick={() => { setEditStaff(null); setShowModal(true); }} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus size={18} /> Add Staff
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" /></div>
        ) : staffList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Users size={48} className="mb-3 opacity-30" />
            <p className="font-medium">No staff members</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Name</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Contact</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Last Seen</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {staffList.map(s => (
                <tr key={s._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                        {s.firstName?.[0]}{s.lastName?.[0]}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{s.firstName} {s.lastName}</p>
                        <p className="text-xs text-gray-400">{s.staffCode || ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${ROLE_COLORS[s.role] || 'bg-gray-100 text-gray-600'}`}>
                      <Shield size={10} />{s.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {s.email && <div>{s.email}</div>}
                    {s.phone && <div>{s.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {s.timeClock?.lastClockIn ? (
                      <div className="flex items-center gap-1">
                        <Clock size={11} />
                        {dayjs(s.timeClock.lastClockIn).format('DD/MM HH:mm')}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => { setEditStaff(s); setShowModal(true); }} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700">
                      <Edit2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && <StaffModal staff={editStaff} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}
