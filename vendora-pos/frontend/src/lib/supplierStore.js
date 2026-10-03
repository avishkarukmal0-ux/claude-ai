// Local-first suppliers store — the places a shop buys from regularly
// (cash-&-carry, wholesalers, roundsmen). Scoped to the active workspace (via lib/storage).
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

const NAME = 'suppliers_v1';

function load() {
  const arr = readJSON(NAME, []);
  return Array.isArray(arr) ? arr : [];
}
function persist(list) {
  return writeJSON(NAME, list);
}
function newId() {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState(load);

  useEffect(() => {
    const refresh = () => setSuppliers(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('vendora:workspace', refresh);
    };
  }, []);

  const addSupplier = useCallback(({ name, phone, notes }) => {
    const s = { id: newId(), name: (name || '').trim() || 'Supplier', phone: (phone || '').trim(), notes: (notes || '').trim(), createdAt: Date.now() };
    setSuppliers((prev) => { const next = [...prev, s]; persist(next); return next; });
    return s;
  }, []);

  const updateSupplier = useCallback((id, patch) => {
    setSuppliers((prev) => { const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s)); persist(next); return next; });
  }, []);

  const removeSupplier = useCallback((id) => {
    setSuppliers((prev) => { const next = prev.filter((s) => s.id !== id); persist(next); return next; });
  }, []);

  return { suppliers, addSupplier, updateSupplier, removeSupplier };
}

// Read suppliers once (non-hook) — for lookups outside React state.
export function loadSuppliers() { return load(); }
export function supplierName(id) {
  if (!id) return null;
  const s = load().find((x) => x.id === id);
  return s ? s.name : null;
}
