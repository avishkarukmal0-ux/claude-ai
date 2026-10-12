import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Truck, Plus, Trash2, Phone, Building2 } from 'lucide-react';
import { useSuppliers } from '../../lib/supplierStore';
import { getFamily } from '../../config/shopTypes';
import ScreenBack from '../common/ScreenBack';
import ConfirmDialog from '../common/ConfirmDialog';

// A phone is optional; if present it should look like a real number (digits/spaces/+-() , 7+ digits).
const phoneOk = (v) => { const t = String(v || '').trim(); return t === '' || (/^[0-9\s()+-]{7,}$/.test(t) && (t.match(/\d/g) || []).length >= 7); };

// Suppliers — the places this shop buys from regularly. Local-first.
export default function SuppliersView({ onBack, familyId }) {
  const { suppliers, addSupplier, removeSupplier, restoreSupplier } = useSuppliers();
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });
  const [confirmDel, setConfirmDel] = useState(null); // supplier to remove

  const family = getFamily(familyId);
  const ideas = (family?.supplierIdeas || []).filter(
    (idea) => !suppliers.some((s) => s.name.toLowerCase() === idea.toLowerCase()),
  );
  const isDuplicate = (name) => suppliers.some((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());

  function add() {
    const name = form.name.trim();
    if (!name) return;
    if (isDuplicate(name)) { toast.error(`You already have a supplier called “${name}”.`); return; }
    if (!phoneOk(form.phone)) { toast.error('Check the phone number.'); return; }
    addSupplier(form);
    toast.success('Supplier added');
    setForm({ name: '', phone: '', notes: '' });
  }
  function addIdea(idea) {
    if (isDuplicate(idea)) { toast.error('Already added.'); return; }
    addSupplier({ name: idea });
    toast.success('Supplier added');
  }
  function doRemove(s) {
    setConfirmDel(null);
    removeSupplier(s.id);
    toast((t) => (
      <span className="flex items-center gap-3 text-sm">Removed “{s.name}”.
        <button type="button" onClick={() => { restoreSupplier(s); toast.dismiss(t.id); }} className="inline-flex min-h-[44px] items-center px-2 font-semibold text-primary underline">Undo</button>
      </span>
    ), { duration: 6000 });
  }

  return (
    <div>
      <ScreenBack onBack={onBack} label="Home" />

      <h2 className="mb-1 text-base font-bold text-gray-900">Suppliers</h2>
      <p className="mb-4 text-xs text-gray-400">The places you buy from regularly — so your buy list can be sorted by where you go.</p>

      {/* Add form */}
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Supplier name" aria-label="Supplier name" className="mb-2 min-h-[44px] w-full rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none" />
        <div className="mb-2 grid grid-cols-2 gap-2">
          <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} inputMode="tel" placeholder="Phone (optional)" aria-label="Phone" className={`min-h-[44px] rounded-xl border px-3 py-2.5 text-base focus:outline-none ${phoneOk(form.phone) ? 'border-gray-200 focus:border-primary' : 'border-danger/50'}`} />
          <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes (rep, day…)" aria-label="Notes" className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none" />
        </div>
        {!phoneOk(form.phone) && <p className="mb-2 text-xs font-medium text-danger-dark">That phone number doesn’t look right.</p>}
        <button type="button" disabled={!form.name.trim()} onClick={add} className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-white disabled:opacity-40">
          <Plus className="h-4 w-4" /> Add supplier
        </button>
      </div>

      {/* Niche-aware suggestions */}
      {ideas.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Common for your shop — tap to add</h3>
          <div className="flex flex-wrap gap-2">
            {ideas.map((idea) => (
              <button key={idea} type="button" onClick={() => addIdea(idea)} aria-label={`Add supplier ${idea}`}
                className="inline-flex min-h-[44px] items-center gap-1 rounded-full border border-primary/30 bg-primary-50 px-3 text-xs font-medium text-primary-700 active:scale-95">
                <Plus className="h-3.5 w-3.5" /> {idea}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The list */}
      {suppliers.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
            <Truck className="h-7 w-7" strokeWidth={1.75} />
          </span>
          <p className="text-sm font-semibold text-gray-900">No suppliers yet</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Add the cash-&-carry and wholesalers you use — tap a suggestion above to start.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {suppliers.map((s) => (
            <li key={s.id} className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                <Building2 className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-900">{s.name}</span>
                {(s.phone || s.notes) && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    {s.phone && <a href={`tel:${s.phone}`} className="flex items-center gap-1 text-primary"><Phone className="h-3 w-3" />{s.phone}</a>}
                    {s.notes && <span>{s.notes}</span>}
                  </span>
                )}
              </span>
              <button type="button" onClick={() => setConfirmDel(s)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-gray-300 hover:text-danger" aria-label={`Remove ${s.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title={`Remove “${confirmDel?.name}”?`}
        message="Takes this supplier off your list. You can undo straight after."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => doRemove(confirmDel)}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
