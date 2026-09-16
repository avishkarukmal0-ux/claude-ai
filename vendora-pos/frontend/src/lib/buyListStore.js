// Local-first "buy list" (cash-&-carry list). Items the shopkeeper plans to
// restock, tickable as bought. Persists to localStorage. No backend.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'vendora_buylist_v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
function persist(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* ignore */ }
}
function newId() {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  return `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useBuyList() {
  const [items, setItems] = useState(load);

  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY) setItems(load()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addItem = useCallback(({ productId, name, barcode, qty, supplierId, supplierName }) => {
    setItems((prev) => {
      // If it's already on the list (same product), just bump the qty.
      const idx = prev.findIndex((i) => productId && i.productId === productId);
      let next;
      if (idx >= 0) {
        next = [...prev];
        next[idx] = { ...next[idx], qty: (Number(next[idx].qty) || 0) + (Number(qty) || 1), bought: false };
      } else {
        next = [{ id: newId(), productId: productId || null, name: name || 'Item', barcode: barcode || '', qty: Number(qty) || 1, supplierId: supplierId || null, supplierName: supplierName || null, bought: false, addedAt: Date.now() }, ...prev];
      }
      persist(next);
      return next;
    });
  }, []);

  const setQty = useCallback((id, qty) => {
    setItems((prev) => { const next = prev.map((i) => (i.id === id ? { ...i, qty: Math.max(1, Number(qty) || 1) } : i)); persist(next); return next; });
  }, []);

  const toggleBought = useCallback((id) => {
    setItems((prev) => { const next = prev.map((i) => (i.id === id ? { ...i, bought: !i.bought } : i)); persist(next); return next; });
  }, []);

  const removeItem = useCallback((id) => {
    setItems((prev) => { const next = prev.filter((i) => i.id !== id); persist(next); return next; });
  }, []);

  const clearBought = useCallback(() => {
    setItems((prev) => { const next = prev.filter((i) => !i.bought); persist(next); return next; });
  }, []);

  const hasProduct = useCallback((productId) => items.some((i) => productId && i.productId === productId), [items]);

  return { items, addItem, setQty, toggleBought, removeItem, clearBought, hasProduct };
}
