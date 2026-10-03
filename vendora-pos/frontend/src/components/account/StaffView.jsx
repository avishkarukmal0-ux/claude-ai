import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft, UserPlus, Loader2, ShieldCheck, Trash2, KeyRound, Users, UserX, UserCheck,
} from 'lucide-react';
import { listStaff, addStaff, updateStaff, removeStaff } from '../../lib/staffAdmin';
import { roleLabel } from '../../lib/permissions';

// Owner-only staff management. Each member gets their own email + password and a role; the backend
// enforces what each role may do (see pwaSyncService). Needs the accounts backend deployed — if it
// isn't, every call fails and we say so plainly rather than pretending it worked.
const ROLE_OPTS = [
  { value: 'staff', label: 'Staff', hint: 'Shop floor: stock, deliveries, counts, waste, tasks. No money records.' },
  { value: 'manager', label: 'Manager', hint: 'Everything operational + money. Can’t manage staff.' },
];

export default function StaffView({ onBack }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'staff', password: '' });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try { setMembers(await listStaff()); }
    catch (err) {
      setError(err?.status === 403 ? 'Only the shop owner can manage staff.'
        : 'Couldn’t load staff. Accounts may not be switched on yet for your shop.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function submitAdd(e) {
    e?.preventDefault?.();
    if (!form.email.trim() || !form.name.trim() || !form.password) { toast.error('Fill in name, email and a password.'); return; }
    if (form.password.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      await addStaff({ email: form.email.trim(), name: form.name.trim(), role: form.role, password: form.password });
      toast.success(`${form.name.trim()} added`);
      setForm({ email: '', name: '', role: 'staff', password: '' });
      setAdding(false);
      await refresh();
    } catch (err) {
      toast.error(err?.status === 409 ? 'That email is already in use.' : 'Couldn’t add that person.');
    } finally { setBusy(false); }
  }

  async function changeRole(m, role) {
    try { await updateStaff(m.id, { role }); toast.success(`${m.name} is now ${roleLabel(role)}`); await refresh(); }
    catch { toast.error('Couldn’t change the role.'); }
  }
  async function toggleActive(m) {
    try { await updateStaff(m.id, { active: !m.active }); toast.success(m.active ? `${m.name} deactivated` : `${m.name} reactivated`); await refresh(); }
    catch { toast.error('Couldn’t update access.'); }
  }
  async function resetPassword(m) {
    const pw = window.prompt(`Set a new password for ${m.name} (at least 8 characters):`);
    if (pw == null) return;
    if (pw.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    try { await updateStaff(m.id, { password: pw }); toast.success('Password reset'); }
    catch { toast.error('Couldn’t reset the password.'); }
  }
  async function remove(m) {
    if (!window.confirm(`Remove ${m.name}? They’ll lose access. Their past actions stay recorded.`)) return;
    try { await removeStaff(m.id); toast.success(`${m.name} removed`); await refresh(); }
    catch { toast.error('Couldn’t remove that person.'); }
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Users className="h-5 w-5" /></span>
        <div>
          <h2 className="text-base font-bold text-gray-900">Staff access</h2>
          <p className="text-xs text-gray-400">Give your team their own logins. You control what each can do.</p>
        </div>
      </div>

      {!adding && (
        <button type="button" onClick={() => setAdding(true)} className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99]">
          <UserPlus className="h-4 w-4" /> Add a team member
        </button>
      )}

      {adding && (
        <form onSubmit={submitAdd} className="mb-4 space-y-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" aria-label="Full name" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} type="email" placeholder="Email (their login)" aria-label="Email" autoComplete="off" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} type="password" placeholder="Temporary password (8+ chars)" aria-label="Temporary password" autoComplete="new-password" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <div className="flex gap-2">
            {ROLE_OPTS.map((r) => (
              <button key={r.value} type="button" onClick={() => setForm((f) => ({ ...f, role: r.value }))} className={`flex-1 rounded-xl border px-3 py-2 text-xs font-semibold ${form.role === r.value ? 'border-primary bg-primary-50 text-primary' : 'border-gray-200 text-gray-600'}`}>{r.label}</button>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">{ROLE_OPTS.find((r) => r.value === form.role)?.hint}</p>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-60">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(null); }} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600">Cancel</button>
          </div>
          <p className="text-[11px] text-gray-400">Share the temporary password with them privately. They can keep using it, or you can reset it any time.</p>
        </form>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-gray-400"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></p>
      ) : error ? (
        <p className="rounded-xl bg-danger/10 px-3 py-3 text-xs text-danger">{error}</p>
      ) : members.length === 0 ? (
        <p className="rounded-xl bg-gray-50 px-3 py-6 text-center text-sm text-gray-400">No team members yet. Add one above so they can sign in with their own login.</p>
      ) : (
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className={`rounded-2xl border p-3 shadow-sm ${m.active ? 'border-gray-100 bg-white' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900">{m.name} {!m.active && <span className="text-[11px] font-normal text-gray-400">· no access</span>}</div>
                  <div className="truncate text-[11px] text-gray-500">{m.email}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.role === 'manager' ? 'bg-primary-50 text-primary' : 'bg-gray-100 text-gray-600'}`}>{roleLabel(m.role)}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.role === 'staff'
                  ? <Mini onClick={() => changeRole(m, 'manager')} icon={ShieldCheck}>Make manager</Mini>
                  : <Mini onClick={() => changeRole(m, 'staff')} icon={ShieldCheck}>Make staff</Mini>}
                <Mini onClick={() => resetPassword(m)} icon={KeyRound}>Reset password</Mini>
                {m.active
                  ? <Mini onClick={() => toggleActive(m)} icon={UserX}>Deactivate</Mini>
                  : <Mini onClick={() => toggleActive(m)} icon={UserCheck}>Reactivate</Mini>}
                <Mini onClick={() => remove(m)} icon={Trash2} danger>Remove</Mini>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-gray-400">
        <ShieldCheck className="h-3.5 w-3.5" /> Everyone sees the same shop. What each role can change is enforced on the server.
      </p>
    </div>
  );
}

function Mini({ icon: Icon, children, onClick, danger }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold active:scale-95 ${danger ? 'border-danger/30 text-danger' : 'border-gray-200 text-gray-600'}`}>
      <Icon className="h-3 w-3" /> {children}
    </button>
  );
}
