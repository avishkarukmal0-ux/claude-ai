// Refusals log (off-licence / age-restricted) — a record of sales refused (under-age, no ID, proxy sale,
// intoxicated). Keeping one is good practice for a premises licence and evidence of due diligence. Local-first,
// workspace-scoped + synced. Entries carry date/time, product, reason and staff initials; a manager sign-off is
// recorded separately (refusals_signoff_v1). Record-only; nothing else reads from it.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { actorName } from './actor';

const NAME = 'refusals_log_v1';
const SIGNOFF = 'refusals_signoff_v1';

export const REFUSAL_REASONS = [
  { id: 'underage', label: 'Under age' },
  { id: 'no-id', label: 'No/invalid ID' },
  { id: 'proxy', label: 'Proxy sale (buying for a minor)' },
  { id: 'intoxicated', label: 'Intoxicated' },
  { id: 'other', label: 'Other' },
];
const REASON_LABEL = Object.fromEntries(REFUSAL_REASONS.map((r) => [r.id, r.label]));

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function loadSignoffs() { const a = readJSON(SIGNOFF, []); return Array.isArray(a) ? a : []; }
function newId(p = 'ref') {
  try { if (crypto?.randomUUID) return `${p}_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** CSV of the log for an inspector / records (kept ~12 months). Pure + unit-testable. */
export function refusalsCsv(list = []) {
  const rows = [['Date', 'Time', 'Product', 'Reason', 'Staff', 'Note']];
  for (const r of Array.isArray(list) ? list : []) {
    const d = new Date(r.at);
    rows.push([
      d.toLocaleDateString('en-GB'), d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      r.product || '', REASON_LABEL[r.reason] || r.reason || '', r.initials || r.by || '', r.note || '',
    ]);
  }
  return rows.map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function useRefusalsLog() {
  const [refusals, setRefusals] = useState(load);
  const [signoffs, setSignoffs] = useState(loadSignoffs);
  useEffect(() => {
    const refresh = () => { setRefusals(load()); setSignoffs(loadSignoffs()); };
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('vendora:workspace', refresh); };
  }, []);
  const persistAll = (next) => { const res = writeJSON(NAME, next); if (res.ok) setRefusals(next); return res; };

  /** Log a refusal. @returns {ok, refusal?} | {ok:false, error} */
  const addRefusal = useCallback(({ reason = 'underage', product = '', note = '', initials = '' }) => {
    if (!REFUSAL_REASONS.some((r) => r.id === reason)) return { ok: false, error: 'Pick a reason.' };
    const r = { id: newId(), reason, product: String(product || '').trim(), note: String(note || '').trim(), initials: String(initials || '').trim().toUpperCase().slice(0, 4), by: actorName(), at: Date.now() };
    const res = persistAll([r, ...load()]);
    return res.ok ? { ok: true, refusal: r } : res;
  }, []);

  const removeRefusal = useCallback((id) => persistAll(load().filter((r) => r.id !== id)), []);

  // Re-insert an exact deleted refusal (for Undo), keeping its id/at; de-dupes by id.
  const restoreRefusal = useCallback((entry) => {
    if (!entry || !entry.id) return;
    persistAll([entry, ...load().filter((r) => r.id !== entry.id)].sort((a, b) => (b.at || 0) - (a.at || 0)));
  }, []);

  /** Record a weekly manager sign-off (initials + timestamp). */
  const signOff = useCallback((initials = '') => {
    const s = { id: newId('so'), initials: String(initials || '').trim().toUpperCase().slice(0, 4) || (actorName() || '—'), at: Date.now() };
    const next = [s, ...loadSignoffs()];
    const res = writeJSON(SIGNOFF, next);
    if (res.ok) setSignoffs(next);
    return res.ok ? { ok: true, signoff: s } : res;
  }, []);

  return { refusals, signoffs, addRefusal, removeRefusal, restoreRefusal, signOff };
}
