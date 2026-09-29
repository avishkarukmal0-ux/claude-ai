// Local-first "suggest to owner" inbox. Staff flag things (stock this / mark down /
// problem); the owner sees and clears them. Persists to localStorage.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

const NAME = 'suggestions_v1';

function load() {
  const arr = readJSON(NAME, []);
  return Array.isArray(arr) ? arr : [];
}
function persist(list) { return writeJSON(NAME, list); }
function newId() {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  return `sg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const SUGGESTION_KINDS = {
  'stock': { label: 'Stock this' },
  'markdown': { label: 'Mark down' },
  'problem': { label: 'Problem' },
  'note': { label: 'Note' },
};

export function useSuggestions() {
  const [items, setItems] = useState(load);

  useEffect(() => {
    const refresh = () => setItems(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('vendora:workspace', refresh);
    };
  }, []);

  const add = useCallback(({ kind, text, productName }) => {
    const s = { id: newId(), kind: SUGGESTION_KINDS[kind] ? kind : 'note', text: (text || '').trim(), productName: productName || '', done: false, ts: Date.now() };
    if (!s.text && !s.productName) return;
    setItems((prev) => { const next = [s, ...prev]; persist(next); return next; });
  }, []);

  const toggleDone = useCallback((id) => {
    setItems((prev) => { const next = prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)); persist(next); return next; });
  }, []);
  const remove = useCallback((id) => {
    setItems((prev) => { const next = prev.filter((i) => i.id !== id); persist(next); return next; });
  }, []);
  const clearDone = useCallback(() => {
    setItems((prev) => { const next = prev.filter((i) => !i.done); persist(next); return next; });
  }, []);

  const openCount = items.filter((i) => !i.done).length;
  return { items, add, toggleDone, remove, clearDone, openCount };
}

export function getOpenSuggestionCount() {
  return load().filter((i) => !i.done).length;
}
