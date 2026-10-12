// Scale checks (Fresh group, weights & measures). Trade scales must be verified and accurate; councils advise
// recorded self-checks with approved weights. This logs: a 'verified' record (the scale carries a verification
// mark, dated) and routine 'selfcheck' records. Local-first, workspace-scoped + synced (scale_checks_v1).
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { actorName } from './actor';

const NAME = 'scale_checks_v1';
export const CHECK_KINDS = { verified: 'Scale verified', selfcheck: 'Self-check with approved weights' };

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function newId() {
  try { if (crypto?.randomUUID) return `sc_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `sc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useScaleChecks() {
  const [checks, setChecks] = useState(load);
  useEffect(() => {
    const refresh = () => setChecks(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('vendora:workspace', refresh); };
  }, []);
  const persistAll = (next) => { const res = writeJSON(NAME, next); if (res.ok) setChecks(next); return res; };

  const recordCheck = useCallback(({ kind = 'selfcheck', note = '' } = {}) => {
    if (!CHECK_KINDS[kind]) return { ok: false, error: 'Unknown check type' };
    const c = { id: newId(), kind, note: String(note || '').trim(), by: actorName(), at: Date.now() };
    const res = persistAll([c, ...load()]);
    return res.ok ? { ok: true, check: c } : res;
  }, []);
  const removeCheck = useCallback((id) => persistAll(load().filter((c) => c.id !== id)), []);

  const lastVerified = checks.find((c) => c.kind === 'verified') || null;
  const lastSelfCheck = checks.find((c) => c.kind === 'selfcheck') || null;
  return { checks, recordCheck, removeCheck, lastVerified, lastSelfCheck };
}
