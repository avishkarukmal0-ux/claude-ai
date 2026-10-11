import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, ShieldAlert, Check, Loader2, Link2 } from 'lucide-react';
import { useCreditNotes, creditNoteReconciliation } from '../../lib/creditNoteStore';
import { useClaims } from '../../lib/claimStore';
import { useRecoveryGuard } from '../../lib/recoveryGuard';
import { readJSON } from '../../lib/storage';

// Owner-facing credit-note RECOVERY (audit round-5 follow-up). When a two-write credit-note correction failed
// AND its compensation failed, CreditNotesView records a durable `creditnote:<id>` pending-repair flag and
// blocks every mutation (Delete / allocate / £0 / Remove). This screen is the explicit, guided way out: it
// shows the note's allocations beside the matching claim credits, reconciles them through the SAME validated
// store operations (applyCredit / removeCredit / setAllocation), then RE-READS both sides from storage and only
// clears the flag once they actually match. A failed write or a still-inconsistent re-read keeps the note
// locked — a reload or dismiss can never silently clear unresolved recovery state.
const gbp = (v) => `£${(Number(v) || 0).toFixed(2)}`;

export default function CreditNoteRecoveryView({ onBack }) {
  const { notes, setAllocation } = useCreditNotes();
  const { claims, applyCredit, removeCredit } = useClaims();
  const recovery = useRecoveryGuard();
  const [busyId, setBusyId] = useState(null); // note id currently reconciling — blocks double taps

  const locked = recovery.list()
    .filter((g) => typeof g.opKey === 'string' && g.opKey.indexOf('creditnote:') === 0)
    .map((g) => {
      const id = g.opKey.slice('creditnote:'.length);
      const note = notes.find((n) => n.id === id) || { id, allocations: [], deleted: true };
      return { id, note, at: g.at, recon: creditNoteReconciliation(note, claims) };
    });

  function reconcile(entry) {
    if (busyId) return; // guard against a double tap while a reconcile is in flight
    const { id, note } = entry;
    setBusyId(id);
    try {
      const { rows } = creditNoteReconciliation(note, claims);
      let allOk = true;
      for (const row of rows) {
        const claimExists = claims.some((c) => c.id === row.claimId);
        if (row.allocated > 0 && claimExists) {
          // Note is the source of truth → set the claim credit to match its allocation (idempotent).
          if (!applyCredit(row.claimId, { creditNoteId: id, creditNoteRef: note.reference || '', amount: row.allocated })) allOk = false;
        } else if (row.allocated > 0 && !claimExists) {
          // The claim is gone — drop the stranded note-side allocation instead.
          if (!setAllocation(id, row.claimId, 0).ok) allOk = false;
        } else if (row.credited > 0) {
          // An orphan claim credit with no matching allocation → remove it.
          if (!removeCredit(row.claimId, id).ok) allOk = false;
        }
      }
      // Re-read BOTH sides fresh from storage (not the stale hook state) and verify before clearing the flag.
      const freshNotes = readJSON('credit_notes_v1', []);
      const freshClaims = readJSON('claims_v1', []);
      const freshNote = (Array.isArray(freshNotes) ? freshNotes : []).find((n) => n.id === id) || { id, allocations: [] };
      const after = creditNoteReconciliation(freshNote, Array.isArray(freshClaims) ? freshClaims : []);
      if (allOk && after.consistent) {
        recovery.clear(`creditnote:${id}`);
        toast.success('Credit note reconciled — the note and its claims now match.');
      } else {
        toast.error('Couldn’t fully reconcile — the note stays locked. Check the claims, then try again.', { duration: 9000 });
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <h2 className="mb-1 flex items-center gap-1.5 text-base font-bold text-gray-900"><ShieldAlert className="h-4 w-4 text-danger" /> Credit note repair</h2>
      <p className="mb-4 text-xs text-gray-400">A credit note couldn’t finish saving and its claim totals may not match. Reconcile it here — the note and claims are corrected together and re-checked before the lock lifts.</p>

      {locked.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-light text-success-dark"><Check className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">Nothing to repair</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">All your credit notes and their claim credits are consistent.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {locked.map(({ id, note, recon }) => (
            <li key={id} className="rounded-2xl border border-danger/30 bg-danger/5 p-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900">
                    {note.deleted ? 'Deleted credit note' : (note.supplierName || 'Supplier')}{note.reference ? ` · ${note.reference}` : ''}
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-500">
                    {note.deleted ? 'The note was removed but some claims may still credit it.' : `${gbp(note.amount)} credit note`}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger">Locked</span>
              </div>

              <p className="mt-2 rounded-lg bg-white/70 px-2.5 py-2 text-[11px] leading-snug text-gray-600">
                Locked because a save failed partway through. The note’s allocations and the claims that credit it
                are shown below — reconciling restores them to match.
              </p>

              <div className="mt-2 space-y-1.5">
                <div className="flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  <span>Claim</span><span>Note says · Claim says</span>
                </div>
                {recon.rows.length === 0 ? (
                  <p className="rounded-lg bg-white px-2.5 py-2 text-[11px] text-gray-500">No allocations or claim credits remain — safe to reconcile.</p>
                ) : recon.rows.map((row) => {
                  const claim = claims.find((c) => c.id === row.claimId);
                  return (
                    <div key={row.claimId} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2">
                      <Link2 className="h-3.5 w-3.5 shrink-0 text-gray-300" />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-gray-800">
                        {claim ? (claim.supplierName || 'Claim') : 'Claim no longer exists'}{claim && claim.deliveryRef ? ` · ${claim.deliveryRef}` : ''}
                      </span>
                      <span className={`shrink-0 text-[11px] tabular-nums ${row.consistent ? 'text-gray-500' : 'font-semibold text-danger'}`}>
                        {gbp(row.allocated)} · {gbp(row.credited)}
                      </span>
                      {row.consistent
                        ? <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                        : <span className="shrink-0 text-[10px] font-bold text-danger">≠</span>}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={busyId === id}
                onClick={() => reconcile({ id, note })}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow active:scale-[0.99] disabled:opacity-60"
              >
                {busyId === id ? <><Loader2 className="h-4 w-4 animate-spin" /> Reconciling…</> : <><Check className="h-4 w-4" /> Reconcile this credit note</>}
              </button>
              <p className="mt-1 text-center text-[10px] text-gray-400">Corrects the note and claims together, re-reads both, and only unlocks if they match.</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
