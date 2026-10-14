import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Receipt, Plus, Trash2, Check, Link2 } from 'lucide-react';
import { useCreditNotes, suggestClaims, remainingToAllocate, allocatedTotal, claimOutstanding } from '../../lib/creditNoteStore';
import { round2 as r2 } from '../../lib/money';
import { useClaims } from '../../lib/claimStore';
import { useSuppliers } from '../../lib/supplierStore';
import { useRecoveryGuard } from '../../lib/recoveryGuard';
import ScreenBack from '../common/ScreenBack';
import ConfirmDialog from '../common/ConfirmDialog';

// Supplier credit notes (Phase 2). Enter a credit note, see which claims it likely covers, and ALLOCATE
// it (partial, or across several claims) with explicit confirmation — each allocation records money as
// actually received on that claim (via claimStore.applyCredit, idempotent per note). Full audit trail.
const gbp = (v) => { const n = Number(v) || 0; return n < 0 ? `-£${Math.abs(n).toFixed(2)}` : `£${n.toFixed(2)}`; };
const dayInput = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');

export default function CreditNotesView({ onBack, prefill }) {
  const { notes, saveNote, setAllocation, removeNote, findDuplicate } = useCreditNotes();
  const { claims, applyCredit, removeCredit } = useClaims();
  const { suppliers } = useSuppliers();
  const recovery = useRecoveryGuard();
  const [adding, setAdding] = useState(false);
  // "Record credit" from a claim hands us a prefill (supplier + amount); open the add form seeded with it.
  useEffect(() => { if (prefill) setAdding(true); }, [prefill]);
  const [allocating, setAllocating] = useState(null); // note id being allocated
  const [confirmDelNote, setConfirmDelNote] = useState(null); // credit note pending delete-confirm
  const [dupPending, setDupPending] = useState(null); // { note, dup } awaiting "save duplicate anyway"

  // Audit R9 (round 3): deleting a note removed its claim-side credits with forEach and IGNORED the results, then
  // deleted the note unconditionally — a failed claim write left the note gone while the claim still credited the
  // money (or, the other way, split the two ledgers). Remove each claim credit FIRST and CHECK it; only delete the
  // note once EVERY claim correction committed, so the two ledgers never split. removeCredit is idempotent, so a
  // retry re-runs cleanly over any that already succeeded.
  // V2 residual (round 5): true if a note is in durable pending-repair — an earlier compensation failed, so its
  // claim/note totals may be split. EVERY mutation (Delete, allocate, £0, Remove) must refuse until the owner
  // reloads and verifies, else the "blocked" state can be bypassed through an allocation callback.
  const noteBlocked = (cn) => recovery.has(`creditnote:${cn.id}`);

  // Re-apply claim credits as COMPENSATION and report whether it FULLY succeeded. applyCredit's result is
  // checked (round 4 ignored it on the £0/Remove paths and falsely reported "restored"); if any write fails we
  // record a durable pending-repair flag so the real split state is never misreported as consistent.
  function compensateCredits(cn, allocs) {
    let ok = true;
    for (const a of allocs) {
      const amt = Number(a.amount) || 0;
      if (amt <= 0) continue;
      if (!applyCredit(a.claimId, { creditNoteId: cn.id, creditNoteRef: cn.reference, amount: amt })) ok = false;
    }
    if (!ok) recovery.record(`creditnote:${cn.id}`, { kind: 'creditnote' });
    return ok;
  }

  // Item 3: when the note was started via a claim's "Record credit", auto-allocate it to that claim on save
  // (capped to what the claim still has outstanding), so the owner doesn't have to Match → Allocate by hand.
  function autoAllocate(note) {
    const claimId = prefill?.claimId;
    if (!claimId || !note) return;
    const claim = claims.find((c) => c.id === claimId);
    if (!claim) return;
    const amt = r2(Math.min(Number(note.amount) || 0, claimOutstanding(claim)));
    if (!(amt > 0)) return;
    const a = setAllocation(note.id, claimId, amt);
    if (a && a.ok === false) { toast.error('Saved — but couldn’t link it to the claim. Use “Match to claims”.'); return; }
    const applied = applyCredit(claimId, { creditNoteId: note.id, creditNoteRef: note.reference, amount: amt });
    if (!applied) { setAllocation(note.id, claimId, 0); toast.error('Saved — but couldn’t record it on the claim. Use “Match to claims”.'); return; }
    toast.success(`Credit allocated to ${claim.supplierName || 'the claim'}`);
  }

  function deleteNote(cn) {
    setConfirmDelNote(null);
    // V2: a note left in pending-repair is blocked until the owner reloads and checks it.
    if (noteBlocked(cn)) { toast.error('This note needs checking after a failed save — reload and verify its claims before changing it.'); return; }
    const removed = [];
    for (const a of (cn.allocations || [])) {
      const rc = removeCredit(a.claimId, cn.id);
      if (!rc.ok) {
        // Nothing durable is split yet — restore any claim credits we already removed and bail. If THAT
        // compensation fails, compensateCredits records the pending-repair flag and we report the true state.
        if (!compensateCredits(cn, removed)) {
          toast.error('Couldn’t update a claim and couldn’t fully restore the others — reload and check this note before changing it.', { duration: 10000 }); return;
        }
        toast.error(rc.error || 'Couldn’t update a claim — the note was kept (claims restored). Please try again.'); return;
      }
      removed.push(a);
    }
    const r = removeNote(cn.id);
    if (r && r.ok === false) {
      // V2: the NOTE write failed AFTER the claim credits were removed — the two ledgers are split (claim £0,
      // note still allocated). COMPENSATE by re-applying the claim credits so both sides match the still-present
      // note; the owner can then retry Delete. If compensation ALSO fails, pending-repair is flagged + reported.
      if (!compensateCredits(cn, removed)) {
        toast.error('Couldn’t delete the note and couldn’t fully restore its claims — reload and check this note before changing it.', { duration: 10000 });
        return;
      }
      toast.error(r.error || 'Couldn’t delete the note — it was kept and its claims restored. Please try again.'); return;
    }
    toast('Credit note deleted');
  }

  return (
    <div>
      <ScreenBack onBack={onBack} />
      <h2 className="mb-1 text-base font-bold text-gray-900">Credit notes</h2>
      <p className="mb-4 text-xs text-gray-400">Record a supplier credit and match it to your claims. Money shows as received only once you allocate it here.</p>

      {!adding && (
        <button type="button" onClick={() => setAdding(true)} className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-white active:scale-[0.99]">
          <Plus className="h-4 w-4" /> Add credit note
        </button>
      )}
      {adding && <AddForm suppliers={suppliers} initial={prefill} onCancel={() => setAdding(false)} onSave={(d) => {
        const dup = findDuplicate(d);
        if (dup) { setDupPending({ note: d, dup }); return; } // confirm via accessible dialog, not window.confirm
        const r = saveNote(d); if (r.ok) { setAdding(false); toast.success('Credit note saved'); autoAllocate(r.note); } else toast.error(r.error || 'Couldn’t save');
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
                    <div className="mt-0.5 text-xs text-gray-500">{cn.date ? new Date(cn.date).toLocaleDateString('en-GB') : 'no date'} · {gbp(cn.amount)} · {gbp(allocatedTotal(cn))} allocated</div>
                    {left > 0.005 && <span className="mt-1 inline-block rounded-full bg-warning-light px-2 py-0.5 text-xs font-semibold text-warning-dark">{gbp(left)} unallocated</span>}
                    {left <= 0.005 && cn.amount > 0 && <span className="mt-1 inline-block rounded-full bg-success-light px-2 py-0.5 text-xs font-semibold text-success-dark">fully allocated</span>}
                  </div>
                  <button type="button" onClick={() => setConfirmDelNote(cn)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-gray-300 hover:text-danger" aria-label={`Delete credit note ${cn.reference || cn.supplierName || ''}`.trim()}><Trash2 className="h-4 w-4" /></button>
                </div>
                <button type="button" onClick={() => setAllocating(allocating === cn.id ? null : cn.id)} className="mt-2 inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-gray-200 px-3 text-xs font-semibold text-gray-700 active:scale-95">
                  <Link2 className="h-3.5 w-3.5" /> {allocating === cn.id ? 'Close' : 'Match to claims'}
                </button>
                {allocating === cn.id && (
                  <Allocator
                    note={cn} claims={claims}
                    onApply={(claim, amount) => {
                      // V2 (round 5): a note in pending-repair refuses EVERY allocation mutation (not just Delete),
                      // so the durable block can't be bypassed through an allocation callback.
                      if (noteBlocked(cn)) { toast.error('This note needs checking after a failed save — reload and verify its claims first.'); return; }
                      const amt = r2(amount);
                      // Audit D6: £0 (or blank) means REMOVE the allocation on BOTH ledgers. Previously this cleared
                      // only the note side (applyCredit ignores £0), leaving the claim still crediting the money while
                      // the note read "unallocated" — so it could be re-allocated elsewhere and double-count. Route an
                      // empty amount through the same both-sides removal as the Remove button.
                      if (!(amt > 0)) {
                        // Remove on BOTH ledgers (D6). D4 r2: clear the CLAIM side first; only clear the note side
                        // once that committed — so a failed claim write can't leave the note "unallocated".
                        const priorZero = (cn.allocations || []).find((a) => a.claimId === claim.id);
                        const rc = removeCredit(claim.id, cn.id);
                        if (!rc.ok) { toast.error(rc.error || 'Couldn’t update the claim — try again'); return; }
                        const r = setAllocation(cn.id, claim.id, 0);
                        if (!r.ok) {
                          // V2 (round 5): note write failed after the claim credit was removed — compensate AND
                          // check the result; a failed compensation flags pending-repair and reports the truth.
                          if (compensateCredits(cn, priorZero ? [priorZero] : [])) toast.error(r.error || 'Couldn’t update — the claim credit was restored. Please try again.');
                          else toast.error('Couldn’t update and couldn’t restore the claim credit — reload and check this note before changing it.', { duration: 10000 });
                          return;
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
                        // Claim side didn't record — restore the note allocation to its PRIOR value (not £0). Check
                        // THAT write too: if it fails the two ledgers are split, so flag pending-repair (V2 r5).
                        const back = setAllocation(cn.id, claim.id, priorAmt);
                        if (back && back.ok === false) {
                          recovery.record(`creditnote:${cn.id}`, { kind: 'creditnote' });
                          toast.error('Couldn’t record the credit and couldn’t restore the note — reload and check this note before changing it.', { duration: 10000 });
                          return;
                        }
                        toast.error('Couldn’t record the credit on the claim');
                        return;
                      }
                      toast.success(`Allocated ${gbp(amt)} to ${claim.supplierName || 'claim'}`);
                    }}
                    onUnapply={(claim) => {
                      if (noteBlocked(cn)) { toast.error('This note needs checking after a failed save — reload and verify its claims first.'); return; }
                      // D4 r2: clear the CLAIM side first; only clear the note side once that committed.
                      const priorU = (cn.allocations || []).find((a) => a.claimId === claim.id);
                      const rc = removeCredit(claim.id, cn.id);
                      if (!rc.ok) { toast.error(rc.error || 'Couldn’t update the claim — try again'); return; }
                      const r = setAllocation(cn.id, claim.id, 0);
                      if (!r.ok) {
                        // V2 (round 5): compensate the already-removed claim credit AND check it; flag on failure.
                        if (compensateCredits(cn, priorU ? [priorU] : [])) toast.error(r.error || 'Couldn’t update — the claim credit was restored. Please try again.');
                        else toast.error('Couldn’t update and couldn’t restore the claim credit — reload and check this note before changing it.', { duration: 10000 });
                        return;
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

      <ConfirmDialog
        open={!!confirmDelNote}
        title="Delete this credit note?"
        message={`${confirmDelNote?.supplierName || 'Credit note'}${confirmDelNote?.reference ? ` · ${confirmDelNote.reference}` : ''}. Any claim credits recorded from it will be removed.`}
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => deleteNote(confirmDelNote)}
        onCancel={() => setConfirmDelNote(null)}
      />
      <ConfirmDialog
        open={!!dupPending}
        title="Possible duplicate"
        message={`This looks like a credit note you already have (${dupPending?.dup?.supplierName || 'supplier'} · ${dupPending?.dup?.reference || 'no ref'} · ${gbp(dupPending?.dup?.amount)}). Save it anyway?`}
        confirmLabel="Save anyway"
        onConfirm={() => { const d = dupPending.note; setDupPending(null); const r = saveNote(d); if (r.ok) { setAdding(false); toast.success('Credit note saved'); autoAllocate(r.note); } else toast.error(r.error || 'Couldn’t save'); }}
        onCancel={() => setDupPending(null)}
      />
    </div>
  );
}

function AddForm({ suppliers, onSave, onCancel, initial }) {
  const [f, setF] = useState({
    supplierName: initial?.supplierName || '',
    reference: initial?.reference || '',
    date: Date.now(),
    amount: initial?.amount != null ? String(initial.amount) : '',
  });
  const [touched, setTouched] = useState(false);
  // Supplier is a picker of existing suppliers, with "Other…" to type a new one. If the prefilled supplier
  // isn't in the list we start in free-type mode so its name is kept.
  const knownNames = suppliers.map((s) => s.name);
  const [otherSupplier, setOtherSupplier] = useState(() => !!f.supplierName && !knownNames.includes(f.supplierName));
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const supplierMissing = !(f.supplierName || '').trim();
  const amountRaw = String(f.amount).trim();
  const amountInvalid = amountRaw === '' || !(Number(f.amount) > 0);
  const canSave = !supplierMissing && !amountInvalid;
  function trySave() {
    setTouched(true);
    if (!canSave) return;
    onSave({ ...f, amount: Number(f.amount) });
  }
  const amtCls = touched && amountInvalid ? 'border-danger/50' : 'border-gray-200 focus:border-primary';
  return (
    <div className="mb-4 rounded-2xl border border-primary/20 bg-primary-50/50 p-3">
      {suppliers.length > 0 && !otherSupplier ? (
        <select
          value={knownNames.includes(f.supplierName) ? f.supplierName : ''}
          onChange={(e) => { if (e.target.value === '__other__') { setOtherSupplier(true); setF((p) => ({ ...p, supplierName: '' })); } else setF((p) => ({ ...p, supplierName: e.target.value })); }}
          aria-label="Supplier"
          className={`mb-1 min-h-[44px] w-full rounded-xl border bg-white px-3 py-2.5 text-base focus:outline-none ${touched && supplierMissing ? 'border-danger/50' : 'border-gray-200 focus:border-primary'}`}
        >
          <option value="">Choose supplier…</option>
          {suppliers.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
          <option value="__other__">Other…</option>
        </select>
      ) : (
        <input value={f.supplierName} onChange={set('supplierName')} placeholder="Supplier name" aria-label="Supplier" className={`mb-1 min-h-[44px] w-full rounded-xl border px-3 py-2.5 text-base focus:outline-none ${touched && supplierMissing ? 'border-danger/50' : 'border-gray-200 focus:border-primary'}`} />
      )}
      {touched && supplierMissing && <p className="mb-1 text-xs font-medium text-danger-dark">Choose or enter the supplier.</p>}
      <div className="mb-1 mt-1 grid grid-cols-3 gap-2">
        <input value={f.reference} onChange={set('reference')} placeholder="Credit ref" aria-label="Credit reference" className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none" />
        <input type="date" value={dayInput(f.date)} onChange={(e) => setF((p) => ({ ...p, date: e.target.value ? new Date(e.target.value).getTime() : null }))} aria-label="Credit date" className="min-h-[44px] rounded-xl border border-gray-200 px-3 py-2.5 text-base focus:border-primary focus:outline-none" />
        <input value={f.amount} onChange={set('amount')} inputMode="decimal" placeholder="£ amount" aria-label="Amount" className={`min-h-[44px] rounded-xl border px-3 py-2.5 text-base focus:outline-none ${amtCls}`} />
      </div>
      {touched && amountInvalid && <p className="mb-1 text-xs font-medium text-danger-dark">Enter an amount greater than £0.</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={trySave} className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-primary px-3 text-sm font-semibold text-white">Save</button>
        <button type="button" onClick={onCancel} className="inline-flex min-h-[44px] items-center rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-600">Cancel</button>
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
    return <p className="mt-2 rounded-lg bg-gray-50 px-2.5 py-2 text-xs text-gray-400">No open claims with an outstanding balance for this supplier.</p>;
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
      <div className="flex items-center justify-between text-xs">
        <span className="min-w-0 truncate font-semibold text-gray-800">{claim.supplierName || 'Claim'}{claim.deliveryRef ? ` · ${claim.deliveryRef}` : ''}</span>
        <span className="shrink-0 text-gray-500">{gbp(outstanding)} outstanding</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" placeholder="£" aria-label={`Amount to allocate to ${claim.supplierName || 'claim'}`} className="min-h-[44px] w-20 rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-primary focus:outline-none" />
        <button type="button" onClick={() => onApply(claim, Number(amt) || 0)} className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-primary px-3 text-xs font-semibold text-white active:scale-95"><Check className="h-3 w-3" /> {already ? 'Update' : 'Allocate'}</button>
        {already > 0 && <button type="button" onClick={() => onUnapply(claim)} className="inline-flex min-h-[44px] items-center rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-500">Remove</button>}
      </div>
    </div>
  );
}
