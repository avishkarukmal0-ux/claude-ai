// Refusals log (off-licence / age-restricted) — a record of sales refused (under-age, no ID, proxy sale,
// intoxicated). Keeping one is good practice for a premises licence and evidence of due diligence. Local-first,
// workspace-scoped + synced (refusals_log_v1). Record-only; nothing else reads from it.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { actorName } from './actor';

const NAME = 'refusals_log_v1';

export const REFUSAL_REASONS = [
  { id: 'underage', label: 'Under age' },
  { id: 'no-id', label: 'No/invalid ID' },
  { id: 'proxy', label: 'Proxy sale (buying for a minor)' },
  { id: 'intoxicated', label: 'Intoxicated' },
  { id: 'other', label: 'Other' },
];

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function persist(list) { return writeJSON(NAME, list); }
function newId() {
  try { if (crypto?.randomUUID) return `ref_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `ref_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useRefusalsLog() {
  const [refusals, setRefusals] = useState(load);
  useEffect(() => {
    const refresh = () => setRefusals(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('vendora:workspace', refresh); };
  }, []);
  const persistAll = (next) => { const res = persist(next); if (res.ok) setRefusals(next); return res; };

  /** Log a refusal. @returns {ok, refusal?} | {ok:false, error} */
  const addRefusal = useCallback(({ reason = 'underage', product = '', note = '' }) => {
    if (!REFUSAL_REASONS.some((r) => r.id === reason)) return { ok: false, error: 'Pick a reason.' };
    const r = { id: newId(), reason, product: String(product || '').trim(), note: String(note || '').trim(), by: actorName(), at: Date.now() };
    const res = persistAll([r, ...load()]);
    return res.ok ? { ok: true, refusal: r } : res;
  }, []);

  const removeRefusal = useCallback((id) => persistAll(load().filter((r) => r.id !== id)), []);

  return { refusals, addRefusal, removeRefusal };
}
