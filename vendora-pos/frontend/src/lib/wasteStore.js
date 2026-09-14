// Local-first waste & savings store. Tracks money lost to the bin and money
// rescued by marking down / using stock in time. Persists to localStorage.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'vendora_waste_v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function persist(entries) {
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* ignore */ }
}
function newId() {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sameMonth(ts, now = Date.now()) {
  const a = new Date(ts); const b = new Date(now);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/** React hook: waste/savings entries + mutators + this-month totals. */
export function useWaste() {
  const [entries, setEntries] = useState(load);

  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY) setEntries(load()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addEntry = useCallback(({ type, name, value, qty, reason }) => {
    const entry = {
      id: newId(),
      type: type === 'saved' ? 'saved' : 'wasted',
      name: (name || '').trim() || (type === 'saved' ? 'Rescued stock' : 'Binned stock'),
      value: Number(value) || 0,
      qty: Number(qty) || 1,
      reason: (reason || '').trim(),
      ts: Date.now(),
    };
    setEntries((prev) => { const next = [entry, ...prev]; persist(next); return next; });
    return entry;
  }, []);

  const removeEntry = useCallback((id) => {
    setEntries((prev) => { const next = prev.filter((e) => e.id !== id); persist(next); return next; });
  }, []);

  const monthWasted = entries.filter((e) => e.type === 'wasted' && sameMonth(e.ts)).reduce((s, e) => s + e.value, 0);
  const monthSaved = entries.filter((e) => e.type === 'saved' && sameMonth(e.ts)).reduce((s, e) => s + e.value, 0);

  return { entries, addEntry, removeEntry, monthWasted, monthSaved };
}
