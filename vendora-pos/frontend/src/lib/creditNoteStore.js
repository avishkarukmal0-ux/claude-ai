// Supplier credit notes (Phase 2). A credit note records money the supplier agreed to refund; it is
// ALLOCATED to one or more claims (partial, or spread across claims). Received money on a claim is only
// ever recorded through an explicit, confirmed allocation (claimStore.applyCredit) — never assumed.
// Workspace-scoped, synced (metadata) like other stores.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

const NAME = 'credit_notes_v1';

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function persist(list) { return writeJSON(NAME, list); }
function newId(p = 'cn') {
  try { if (crypto?.randomUUID) return `${p}_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const norm = (s) => (s || '').trim().toLowerCase();

/** Total already allocated from a credit note, and what's left to allocate. */
export function allocatedTotal(cn) { return r2((cn.allocations || []).reduce((s, a) => s + (Number(a.amount) || 0), 0)); }
export function remainingToAllocate(cn) { return r2((Number(cn.amount) || 0) - allocatedTotal(cn)); }

/** Outstanding on a claim = approved (or requested) − already received. Only positive values can be credited. */
export function claimOutstanding(claim) {
  const target = claim.approvedAmount != null ? Number(claim.approvedAmount)
    : (claim.requestedAmount != null ? Number(claim.requestedAmount)
      : (claim.items || []).reduce((n, i) => n + (Number(i.amount) || 0), 0));
  const received = Number(claim.receivedAmount) || 0;
  return r2(Math.max(0, (Number(target) || 0) - received));
}

/**
 * Suggest claims a credit note likely covers, best first. Scored by: same supplier, reference overlap,
 * amount closeness to the claim's outstanding, and date proximity. Only open claims with something
 * outstanding are considered. Pure.
 */
export function suggestClaims(cn, claims = [], now = Date.now()) {
  const sup = norm(cn.supplierName || cn.supplierId);
  const ref = norm(cn.reference);
  const amt = Number(cn.amount) || 0;
  const out = [];
  for (const c of claims) {
    const outstanding = claimOutstanding(c);
    if (outstanding <= 0) continue;
    let score = 0;
    const csup = norm(c.supplierName || c.supplierId);
    if (sup && csup && sup === csup) score += 100; else if (sup && csup) continue; // different supplier → skip
    if (ref && (norm(c.deliveryRef).includes(ref) || norm(c.creditNoteRef) === ref)) score += 40;
    if (amt > 0) { const diff = Math.abs(outstanding - amt) / Math.max(outstanding, amt); score += Math.max(0, 30 * (1 - diff)); }
    const days = Math.abs((now - (c.updatedAt || c.createdAt || now)) / 86400000);
    score += Math.max(0, 10 - days / 7);
    out.push({ claim: c, outstanding, score: Math.round(score) });
  }
  return out.sort((a, b) => b.score - a.score);
}

export function useCreditNotes() {
  const [notes, setNotes] = useState(load);
  useEffect(() => {
    const refresh = () => setNotes(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('vendora:workspace', refresh); };
  }, []);
  const commit = (next) => { const res = persist(next); if (res.ok) setNotes(next); return res; };

  const saveNote = useCallback((draft) => {
    const id = draft.id || newId();
    const note = {
      id,
      supplierId: draft.supplierId || null,
      supplierName: (draft.supplierName || '').trim(),
      reference: (draft.reference || '').trim(),
      date: draft.date || null,
      amount: r2(draft.amount),
      allocations: draft.allocations || [], // [{ claimId, amount, at }]
      note: (draft.note || '').trim(),
      createdAt: draft.createdAt || Date.now(),
      updatedAt: Date.now(),
    };
    const res = commit([note, ...load().filter((x) => x.id !== id)]);
    return res.ok ? { ok: true, note } : res;
  }, []);

  /** Record that `amount` of this note is allocated to `claimId`. Guards against over-allocating the note.
   *  Idempotent per claim (re-allocating replaces that claim's slice). Caller applies it to the claim. */
  const setAllocation = useCallback((noteId, claimId, amount) => {
    const amt = r2(amount);
    const cur = load().find((x) => x.id === noteId);
    if (!cur) return { ok: false, error: 'Credit note not found' };
    const others = (cur.allocations || []).filter((a) => a.claimId !== claimId);
    const otherTotal = others.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    if (amt + otherTotal - (Number(cur.amount) || 0) > 0.005) {
      return { ok: false, error: `That exceeds the credit note. £${r2((Number(cur.amount) || 0) - otherTotal).toFixed(2)} left to allocate.` };
    }
    const allocations = amt > 0 ? [...others, { claimId, amount: amt, at: Date.now() }] : others;
    const next = load().map((x) => (x.id === noteId ? { ...x, allocations, updatedAt: Date.now() } : x));
    const res = commit(next);
    return res.ok ? { ok: true } : res;
  }, []);

  const removeNote = useCallback((id) => commit(load().filter((x) => x.id !== id)), []);

  return { notes, saveNote, setAllocation, removeNote };
}
