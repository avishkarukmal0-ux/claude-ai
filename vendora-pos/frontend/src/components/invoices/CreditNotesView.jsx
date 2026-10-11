import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Receipt, Plus, Trash2, Check, Link2 } from 'lucide-react';
import { useCreditNotes, suggestClaims, remainingToAllocate, allocatedTotal, claimOutstanding } from '../../lib/creditNoteStore';
import { round2 as r2 } from '../../lib/money';
import { useClaims } from '../../lib/claimStore';
import { useSuppliers } from '../../lib/supplierStore';
import { useRecoveryGuard } from '../../lib/recoveryGuard';

// Supplier credit notes (Phase 2). Enter a credit note, see which claims it likely covers, and ALLOCATE
// it (partial, or across several claims) with explicit confirmation — each allocation records money as
// actually received on that claim (via claimStore.applyCredit, idempotent per note). Full audit trail.
const gbp = (v) => `£${(Number(v) || 0).toFixed(2)}`;
const dayInput = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');

export default function CreditNotesView({ onBack }) {
  const { notes, saveNote, setAllocation, removeNote, findDuplicate } = useCreditNotes();
  const { claims, applyCredit, removeCredit } = useClaims();
  const { suppliers } = useSuppliers();
  const recovery = useRecoveryGuard();
  const [adding, setAdding] = useState(false);
  const [allocating, setAllocating] = useState(null); // note id being allocated

  // Audit R9 (round 3): deleting a note removed its claim-side credits with forEach and IGNORED the results, then
  // deleted the note unconditionally — a failed claim write left the note gone while the claim still credited the
  // money (or, the other way, split the two ledgers). Remove each claim credit FIRST and CHECK it; only delete the
  // note once EVERY claim correction committed, so the two ledgers never split. removeCredit is idempotent, so a
  // retry re-runs cleanly over any that already succeeded.
  function deleteNote(cn) {
    if (!window.confirm('Delete this credit note? (claim credits from it will be removed)')) return;
    // V2 (round 4): a note left in pending-repair (an earlier note write failed after its claim credits were
    // removed, and the compensation also failed) is blocked until the owner reloads and checks it.
    if (recovery.has(`creditnote:${cn.id}`)) { toast.error('This note needs checking after a failed save — reload and verify its claims before changing it.'); return; }
    const removed = [];
    for (const a of (cn.allocations || [])) {
      const rc = removeCredit(a.claimId, cn.id);
      if (!rc.ok) {
        // Nothing durable is split yet — restore any claim credits we already removed and bail.
        for (const d of removed) applyCredit(d.claimId, { creditNoteId: cn.id, creditNoteRef: cn.reference, amount: d.amount });
        toast.error(rc.error || 'Couldn’t update a claim — the note was kept. Please try again.'); return;
      }
      removed.push(a);
    }
    const r = removeNote(cn.id);
    if (r && r.ok === false) {
      // V2: the NOTE write failed AFTER the claim credits were removed — the two ledgers are split (claim £0,
      // note still allocated). COMPENSATE by re-applying the claim credits so both sides match the still-present
      // note; the owner can then retry Delete. If compensation ALSO fails, flag a durable pending-repair + block.
      let repaired = true;
      for (const a of removed) { if (!applyCredit(a.claimId, { creditNoteId: cn.id, creditNoteRef: cn.reference, amount: a.amount })) repaired = false; }
      if (!repaired) {
        recovery.record(`creditnote:${cn.id}`, { kind: 'creditnote' });
        toast.error('Couldn’t delete the note and couldn’t fully restore its claims — reload and check this note before changing it.', { duration: 10000 });
        return;
      }
      toast.error(r.error || 'Couldn’t delete the note — it was kept and its claims restored. Please try again.'); return;
    }
    toast('Credit note deleted');
  }

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
                  <button type="button" onClick={() => deleteNote(cn)} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                </div>
                <button type="button" onClick={() => setAllocating(allocating === cn.id ? null : cn.id)} className="mt-2 flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 active:scale-95">
                  <Link2 className="h-3.5 w-3.5" /> {allocating === cn.id ? 'Close' : 'Match to claims'}
                </button>
                {allocating === cn.id && (
                  <Allocator
                    note={cn} claims={claims}
                    onApply={(claim, amount) => {
                      const amt = r2(amount);
                      // Audit D6: £0 (or blank) means REMOVE the allocation on BOTH ledgers. Previously this cleared
                      // only the note side (applyCredit ignores £0), leaving the claim still crediting the money while
                      // the note read "unallocated" — so it could be re-allocated elsewhere and double-count. Route an
                      // empty amount through the same both-sides removal as the Remove button.
                      if (!(amt > 0)) {
                        // Remove on BOTH ledgers (D6). D4 r2: clear the CLAIM side first; only clear the note side
                        // once that committed — so a failed claim write can't leave the note "unallocated" while the
                        // claim still credits the money (which could then be re-allocated and double-count).
                        const priorZero = (cn.allocations || []).find((a) => a.claimId === claim.id);
                        const priorZeroAmt = priorZero ? (Number(priorZero.amount) || 0) : 0;
                        const rc = removeCredit(claim.id, cn.id);
                        if (!rc.ok) { toast.error(rc.error || 'Couldn’t update the claim — try again'); return; }
                        const r = setAllocation(cn.id, claim.id, 0);
                        if (!r.ok) {
                          // V2 (round 4): note write failed after the claim credit was removed — re-apply the
                          // claim credit so the two ledgers stay consistent instead of split.
                          if (priorZeroAmt > 0) applyCredit(claim.id, { creditNoteId: cn.id, creditNoteRef: cn.reference, amount: priorZeroAmt });
                          toast.error(r.error || 'Couldn’t update — the claim credit was restored. Please try again.'); return;
                        }
                        toast('Allocation removed');
                        return;
                      }
                      // D4 r2: capture any PRIOR allocation for this claim so a failed claim-side write restores it
                      // rather than clearing it to £0 (losing a correct prior credit).
                      const prior = (cn.allocations || []).find((a) => a.claimId === claim.id);
                      const priorAmt = prior ? (Number(prior.amount) || 0) : 0;
                      const r = setAllocation(cn.id, claim.id, amt);
                      if (!r.ok) { toast.error(r.error || 'Couldn’t allocate'); return; }
                      const applied = applyCredit(claim.id, { creditNoteId: cn.id, creditNoteRef: cn.reference, amount: amt });
                      if (!applied) {
                        // Claim side didn't record — restore the note allocation to its PRIOR value (not £0) so a
                        // previously-correct credit isn't wiped and the two ledgers stay in step.
                        setAllocation(cn.id, claim.id, priorAmt);
                        toast.error('Couldn’t record the credit on the claim');
                        return;
                      }
                      toast.success(`Allocated ${gbp(amt)} to ${claim.supplierName || 'claim'}`);
                    }}
                    onUnapply={(claim) => {
                      // D4 r2: clear the CLAIM side first; only clear the note side once that committed.
                      const priorU = (cn.allocations || []).find((a) => a.claimId === claim.id);
                      const priorUAmt = priorU ? (Number(priorU.amount) || 0) : 0;
                      const rc = removeCredit(claim.id, cn.id);
                      if (!rc.ok) { toast.error(rc.error || 'Couldn’t update the claim — try again'); return; }
                      const r = setAllocation(cn.id, claim.id, 0);
                      if (!r.ok) {
                        // V2 (round 4): compensate the already-removed claim credit if the note write fails.
                        if (priorUAmt > 0) applyCredit(claim.id, { creditNoteId: cn.id, creditNoteRef: cn.reference, amount: priorUAmt });
                        toast.error(r.error || 'Couldn’t update — the claim credit was restored. Please try again.'); return;
                      }
                      toast('Allocation removed');
                    }}
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
  // Audit D5: once a claim is fully covered its outstanding is £0, so suggestClaims drops it — but the owner
  // still needs to see and CORRECT (reduce/remove) that allocation. Start from the suggestions, then append any
  // claim this note already credits that isn't already shown, so its Update/Remove row is always reachable.
  const rows = [...suggestions];
  const shown = new Set(suggestions.map((s) => s.claim.id));
  for (const claimId of allocatedTo.keys()) {
    if (shown.has(claimId)) continue;
    const claim = claims.find((c) => c.id === claimId);
    if (!claim) continue; // claim gone — the note delete/void path reverses orphaned allocations
    rows.push({ claim, outstanding: claimOutstanding(claim) });
  }
  if (rows.length === 0) {
    return <p className="mt-2 rounded-lg bg-gray-50 px-2.5 py-2 text-[11px] text-gray-400">No open claims with an outstanding balance for this supplier.</p>;
  }
  return (
    <div className="mt-2 space-y-1.5">
      {rows.map(({ claim, outstanding }) => {
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
