// Customer requests — "do you sell…?" logged so repeat demand is visible when buying.
// Scoped to the active workspace. Asking for the same item again bumps a count instead of
// creating a duplicate, so the most-asked-for lines rise to the top.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

const NAME = 'requests_v1';
// Lifecycle (audit W15): open (waiting demand) → planned (added to the buy list) → stocked (actually
// received/confirmed in) · or declined. "stocked" now means the item is really in, not just on the list.
export const REQUEST_STATUSES = ['open', 'planned', 'stocked', 'declined'];
const ACTIVE_STATUSES = ['open', 'planned']; // still-live demand

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function persist(list) { return writeJSON(NAME, list); }
function newId() {
  try { if (crypto?.randomUUID) return `rq_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `rq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const norm = (s) => (s || '').trim().toLowerCase();

/** Open requests, most-requested first. */
const rank = (st) => (st === 'open' ? 0 : st === 'planned' ? 1 : 2);
export function sortRequests(list) {
  return [...list].sort((a, b) => {
    const s = rank(a.status) - rank(b.status);
    if (s) return s;
    if (b.count !== a.count) return b.count - a.count;
    return b.lastAt - a.lastAt;
  });
}

export function useRequests() {
  const [requests, setRequests] = useState(load);

  useEffect(() => {
    const refresh = () => setRequests(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('vendora:workspace', refresh);
    };
  }, []);

  const commit = (next) => { persist(next); setRequests(next); };

  /** Log a request. Re-asking for the same open item bumps its count. */
  const addRequest = useCallback(({ name, barcode, note }) => {
    const cur = load();
    const key = norm(name);
    if (!key) return null;
    // Re-asking preserves live demand: bump the existing open OR planned request instead of creating a
    // duplicate (audit W15). A re-ask for a planned item also pulls it back to 'open' so it's visible again.
    const idx = cur.findIndex((r) => ACTIVE_STATUSES.includes(r.status) && norm(r.name) === key);
    if (idx >= 0 && cur[idx].status === 'planned') {
      const next = cur.map((r, i) => (i === idx ? { ...r, status: 'open', count: (r.count || 1) + 1, lastAt: Date.now(), note: note || r.note } : r));
      commit(next);
      return next[idx];
    }
    if (idx >= 0) {
      const next = cur.map((r, i) => (i === idx ? { ...r, count: (r.count || 1) + 1, lastAt: Date.now(), note: note ? note : r.note } : r));
      commit(next);
      return next[idx];
    }
    const req = { id: newId(), name: name.trim(), barcode: (barcode || '').trim(), note: (note || '').trim(), count: 1, status: 'open', firstAt: Date.now(), lastAt: Date.now() };
    commit([req, ...cur]);
    return req;
  }, []);

  const setStatus = useCallback((id, status) => {
    commit(load().map((r) => (r.id === id ? { ...r, status } : r)));
  }, []);
  const removeRequest = useCallback((id) => { commit(load().filter((r) => r.id !== id)); }, []);

  return { requests, addRequest, setStatus, removeRequest };
}

export function getOpenRequestCount() {
  return load().filter((r) => r.status === 'open').length;
}
