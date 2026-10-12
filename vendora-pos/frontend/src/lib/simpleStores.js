// Small shared helpers for the compliance log tools (licence log, recall log, …) so each one doesn't
// re-implement the same workspace-scoped array store. Local-first + synced; a same-tab write updates state.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { actorName } from './actor';

function newId(p) {
  try { if (crypto?.randomUUID) return `${p}_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** A workspace-scoped array log at `name`. Returns { items, add(fields), remove(id) }. Each item gets an id,
 *  `by` (actor) and `at` (timestamp) automatically; `fields` are merged in. */
export function useArrayLog(name, prefix = 'e') {
  const load = () => { const a = readJSON(name, []); return Array.isArray(a) ? a : []; };
  const [items, setItems] = useState(load);
  useEffect(() => {
    const refresh = () => setItems(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('vendora:workspace', refresh); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  const persistAll = (next) => { const res = writeJSON(name, next); if (res.ok) setItems(next); return res; };
  const add = useCallback((fields = {}) => {
    const entry = { id: newId(prefix), ...fields, by: actorName(), at: Date.now() };
    const res = persistAll([entry, ...load()]);
    return res.ok ? { ok: true, entry } : res;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, prefix]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const remove = useCallback((id) => persistAll(load().filter((e) => e.id !== id)), [name]);
  return { items, add, remove };
}

/** CSV from an array log using an ordered list of [header, key|fn] columns. Pure. */
export function logCsv(items, columns) {
  const head = columns.map(([h]) => h);
  const body = (Array.isArray(items) ? items : []).map((it) => columns.map(([, k]) => {
    const v = typeof k === 'function' ? k(it) : it[k];
    return v == null ? '' : String(v);
  }));
  return [head, ...body].map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}
