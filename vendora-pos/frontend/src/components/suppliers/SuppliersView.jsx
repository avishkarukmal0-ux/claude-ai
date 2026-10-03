import React, { useState } from 'react';
import { ArrowLeft, Truck, Plus, Trash2, Phone, Building2 } from 'lucide-react';
import { useSuppliers } from '../../lib/supplierStore';
import { getFamily } from '../../config/shopTypes';

// Suppliers — the places this shop buys from regularly. Local-first.
// Suggestions are tailored to the shop's family (typical buying places).
export default function SuppliersView({ onBack, familyId }) {
  const { suppliers, addSupplier, removeSupplier } = useSuppliers();
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });

  const family = getFamily(familyId);
  const ideas = (family?.supplierIdeas || []).filter(
    (idea) => !suppliers.some((s) => s.name.toLowerCase() === idea.toLowerCase())
  );

  function add() {
    if (!form.name.trim()) return;
    addSupplier(form);
    setForm({ name: '', phone: '', notes: '' });
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>

      <h2 className="mb-1 text-base font-bold text-gray-900">Suppliers</h2>
      <p className="mb-4 text-xs text-gray-400">The places you buy from regularly — so your buy list can be sorted by where you go.</p>

      {/* Add form */}
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Supplier name" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <div className="mb-2 grid grid-cols-2 gap-2">
          <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} inputMode="tel" placeholder="Phone (optional)" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes (rep, day…)" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        </div>
        <button type="button" disabled={!form.name.trim()} onClick={add} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          <Plus className="h-4 w-4" /> Add supplier
        </button>
      </div>

      {/* Niche-aware suggestions */}
      {ideas.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Common for your shop — tap to add</h3>
          <div className="flex flex-wrap gap-2">
            {ideas.map((idea) => (
              <button
                key={idea}
                type="button"
                onClick={() => addSupplier({ name: idea })}
                className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 active:scale-95"
              >
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
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                    {s.phone && <a href={`tel:${s.phone}`} className="flex items-center gap-1 text-primary"><Phone className="h-3 w-3" />{s.phone}</a>}
                    {s.notes && <span>{s.notes}</span>}
                  </span>
                )}
              </span>
              <button type="button" onClick={() => removeSupplier(s.id)} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Remove supplier">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
