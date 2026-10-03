// Waste & savings ledger. Tracks money lost to the bin and money rescued by marking down /
// using stock in time. Scoped to the active workspace (via lib/storage).
//
// Two kinds of waste entry:
//  - PRODUCT-LINKED (has productId + batchId): created together with a stock reduction and a
//    typed WASTE movement in inventoryStore.recordWaste(); deleting it undoes both.
//  - STANDALONE (no productId): a manual "quick log" for stock that isn't in the catalogue.
// "saved" entries are a motivational counter (money kept), not a stock event.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

const NAME = 'waste_v1';

function load() {
  const arr = readJSON(NAME, []);
  return Array.isArray(arr) ? arr : [];
}
function persist(entries) {
  return writeJSON(NAME, entries);
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
    const refresh = () => setEntries(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('vendora:workspace', refresh);
    };
  }, []);

  const addEntry = useCallback(({ type, name, value, qty, reason, productId, batchId, productBatchId, batchInfo }) => {
    const entry = {
      id: newId(),
      type: type === 'saved' ? 'saved' : 'wasted',
      name: (name || '').trim() || (type === 'saved' ? 'Rescued stock' : 'Binned stock'),
      value: Number(value) || 0,
      qty: Number(qty) || 1,
      reason: (reason || '').trim(),
      productId: productId || null,
      batchId: batchId || null,             // waste-undo group id
      productBatchId: productBatchId || null, // dated batch (for batch-aware undo)
      batchInfo: batchInfo || null,          // { expiry, dateType } snapshot for recreating on undo
      ts: Date.now(),
    };
    const next = [entry, ...load()];
    persist(next);
    setEntries(next);
    return entry;
  }, []);

  const removeEntry = useCallback((id) => {
    const next = load().filter((e) => e.id !== id);
    persist(next);
    setEntries(next);
  }, []);

  const monthWasted = entries.filter((e) => e.type === 'wasted' && sameMonth(e.ts)).reduce((s, e) => s + e.value, 0);
  const monthSaved = entries.filter((e) => e.type === 'saved' && sameMonth(e.ts)).reduce((s, e) => s + e.value, 0);

  return { entries, addEntry, removeEntry, monthWasted, monthSaved };
}
