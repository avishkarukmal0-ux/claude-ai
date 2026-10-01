import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Receipt, Plus, Trash2, Check, Link2 } from 'lucide-react';
import { useCreditNotes, suggestClaims, remainingToAllocate, allocatedTotal, claimOutstanding } from '../../lib/creditNoteStore';
import { useClaims } from '../../lib/claimStore';
import { useSuppliers } from '../../lib/supplierStore';

// Supplier credit notes (Phase 2). Enter a credit note, see which claims it likely covers, and ALLOCATE
// it (partial, or across several claims) with explicit confirmation — each allocation records money as
// actually received on that claim (via claimStore.applyCredit, idempotent per note). Full audit trail.
const gbp = (v) => `£${(Number(v) || 0).toFixed(2)}`;
const dayInput = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');

export default function CreditNotesView({ onBack }) {
  const { notes, saveNote, setAllocation, removeNote, findDuplicate } = useCreditNotes();
  const { claims, applyCredit, removeCredit } = useClaims();
  const { suppliers } = useSuppliers();
  const [adding, setAdding] = useState(false);
  const [allocating, setAllocating] = useState(null); // note id being allocated

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">Credit notes</h2>
      <p className="mb-4 text-xs text-gray-400">Record a supplier credit and match it to your claims. Money shows as received only once you allocate it here.</p>

      {!adding && (
        <button type="button" onClick={() => setAdding(true)} className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99]">
          <Plus className="h-4 w-4" /> Add credit note
        </button>
      )}
      {adding && <AddForm suppliers={suppliers} onCancel={() => setAdding(false)} onSave={(d) => {
        const dup = findDuplicate(d);
        if (dup && !window.confirm(`This looks like a duplicate of a credit note you already have (${dup.supplierName || 'supplier'} · ${dup.reference || 'no ref'} · £${(Number(dup.amount) || 0).toFixed(2)}). Save it anyway?`)) return;
        const r = saveNote(d); if (r.ok) { setAdding(false); toast.success('Credit note saved'); } else toast.error(r.error || 'Couldn’t save');
      }} />}

      {notes.length === 0 && !adding ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Receipt className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">No credit notes yet</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">When a supplier sends a credit, record it here and match it to the claim it settles.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notes.map((cn) => {
            const left = remainingToAllocate(cn);
            return (
              <li key={cn.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{cn.supplierName || 'Supplier'}{cn.reference ? ` · ${cn.reference}` : ''}</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">{cn.date ? new Date(cn.date).toLocaleDateString('en-GB') : 'no date'} · {gbp(cn.amount)} · {gbp(allocatedTotal(cn))} allocated</div>
                    {left > 0.005 && <span className="mt-1 inline-block rounded-full bg-warning-light px-2 py-0.5 text-[10px] font-semibold text-warning-dark">{gbp(left)} unallocated</span>}
                    {left <= 0.005 && cn.amount > 0 && <span className="mt-1 inline-block rounded-full bg-success-light px-2 py-0.5 text-[10px] font-semibold text-success-dark">fully allocated</span>}
                  </div>
                  <button type="button" onClick={() => { if (window.confirm('Delete this credit note? (claim credits from it will be removed)')) { (cn.allocations || []).forEach((a) => removeCredit(a.claimId, cn.id)); removeNote(cn.id); } }} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
                <button type="button" onClick={() => setAllocating(allocating === cn.id ? null : cn.id)} className="mt-2 flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 active:scale-95">
                  <Link2 className="h-3.5 w-3.5" /> {allocating === cn.id ? 'Close' : 'Match to claims'}
                </button>
                {allocating === cn.id && (
                  <Allocator
                    note={cn} claims={claims}
                    onApply={(claim, amount) => {
                      const r = setAllocation(cn.id, claim.id, amount);
                      if (!r.ok) { toast.error(r.error || 'Couldn’t allocate'); return; }
                      applyCredit(claim.id, { creditNoteId: cn.id, creditNoteRef: cn.reference, amount });
                      toast.success(`Allocated ${gbp(amount)} to ${claim.supplierName || 'claim'}`);
                    }}
                    onUnapply={(claim) => { setAllocation(cn.id, claim.id, 0); removeCredit(claim.id, cn.id); toast('Allocation removed'); }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AddForm({ suppliers, onSave, onCancel }) {
  const [f, setF] = useState({ supplierName: '', reference: '', date: Date.now(), amount: '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const canSave = (f.supplierName || '').trim() && Number(f.amount) > 0;
  return (
    <div className="mb-4 rounded-2xl border border-primary/20 bg-primary-50/50 p-3">
      <input value={f.supplierName} onChange={set('supplierName')} list="vendora-cn-suppliers" placeholder="Supplier" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      <datalist id="vendora-cn-suppliers">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
      <div className="mb-2 grid grid-cols-3 gap-2">
        <input value={f.reference} onChange={set('reference')} placeholder="Credit ref" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <input type="date" value={dayInput(f.date)} onChange={(e) => setF((p) => ({ ...p, date: e.target.value ? new Date(e.target.value).getTime() : null }))} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <input value={f.amount} onChange={set('amount')} inputMode="decimal" placeholder="£ amount" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!canSave} onClick={() => onSave({ ...f, amount: Number(f.amount) })} className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Save</button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600">Cancel</button>
      </div>
    </div>
  );
}

function Allocator({ note, claims, onApply, onUnapply }) {
  const suggestions = useMemo(() => suggestClaims(note, claims), [note, claims]);
  const allocatedTo = new Map((note.allocations || []).map((a) => [a.claimId, a.amount]));
  const left = remainingToAllocate(note);
  if (suggestions.length === 0 && allocatedTo.size === 0) {
    return <p className="mt-2 rounded-lg bg-gray-50 px-2.5 py-2 text-[11px] text-gray-400">No open claims with an outstanding balance for this supplier.</p>;
  }
  return (
    <div className="mt-2 space-y-1.5">
      {suggestions.map(({ claim, outstanding }) => {
        const already = allocatedTo.get(claim.id) || 0;
        const suggested = Math.min(left + already, outstanding);
        return <AllocRow key={claim.id} claim={claim} outstanding={outstanding} already={already} suggested={suggested} onApply={onApply} onUnapply={onUnapply} />;
      })}
    </div>
  );
}

function AllocRow({ claim, outstanding, already, suggested, onApply, onUnapply }) {
  const [amt, setAmt] = useState(String(already || (suggested > 0 ? suggested.toFixed(2) : '')));
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-2">
      <div className="flex items-center justify-between text-[11px]">
        <span className="min-w-0 truncate font-semibold text-gray-800">{claim.supplierName || 'Claim'}{claim.deliveryRef ? ` · ${claim.deliveryRef}` : ''}</span>
        <span className="shrink-0 text-gray-500">{gbp(outstanding)} outstanding</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="£" className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-primary focus:outline-none" />
        <button type="button" onClick={() => onApply(claim, Number(amt) || 0)} className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-white active:scale-95"><Check className="h-3 w-3" /> {already ? 'Update' : 'Allocate'}</button>
        {already > 0 && <button type="button" onClick={() => onUnapply(claim)} className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-500">Remove</button>}
      </div>
    </div>
  );
}
