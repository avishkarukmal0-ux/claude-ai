// Local-first inventory store — real, working stock data saved on the device.
// No backend yet: persists to localStorage so it survives reloads and works offline.
// When the backend lands, this same shape syncs up. Every mutation re-persists.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'vendora_inventory_v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(products) {
  try {
    localStorage.setItem(KEY, JSON.stringify(products));
  } catch {
    /* ignore — private mode / quota */
  }
}

function newId() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch { /* ignore */ }
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Profit margin as a share of sell price (0–1), or null if not computable. */
export function margin(p) {
  const cost = Number(p.cost);
  const price = Number(p.price);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost)) return null;
  return (price - cost) / price;
}

export function isLowStock(p) {
  const qty = Number(p.qty) || 0;
  const min = Number(p.min) || 0;
  return min > 0 ? qty <= min : qty <= 3; // default low-stock threshold
}

// Date types: best-before = soft (sell if fit / mark down); use-by & medicine =
// LEGAL hard-stop (illegal / criminal to sell after date).
export const DATE_TYPES = {
  'best-before': { label: 'Best before', hard: false },
  'use-by': { label: 'Use by', hard: true },
  'medicine': { label: 'Medicine expiry', hard: true },
};

/** Expiry status for a product, or null if no date set. */
export function expiryInfo(p, from = new Date()) {
  if (!p.expiry) return null;
  const d = new Date(p.expiry); d.setHours(0, 0, 0, 0);
  const today = new Date(from); today.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((d - today) / 86400000);
  const type = DATE_TYPES[p.dateType] ? p.dateType : 'best-before';
  const hard = DATE_TYPES[type].hard;
  let status = 'ok';
  if (daysLeft < 0) status = 'expired';
  else if (daysLeft <= 7) status = 'soon';
  return { date: d, daysLeft, type, hard, status, mustPull: hard && daysLeft < 0 };
}

/** React hook: live inventory + mutators. Components re-render on every change. */
export function useInventory() {
  const [products, setProducts] = useState(load);

  // Keep multiple open tabs/instances roughly in sync.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY) setProducts(load()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const commit = useCallback((next) => {
    setProducts(next);
    persist(next);
  }, []);

  const addProduct = useCallback((p) => {
    const product = {
      id: newId(),
      barcode: (p.barcode || '').trim(),
      name: (p.name || '').trim() || 'Unnamed item',
      cost: p.cost === '' || p.cost == null ? null : Number(p.cost),
      price: p.price === '' || p.price == null ? null : Number(p.price),
      qty: Number(p.qty) || 0,
      min: Number(p.min) || 0,
      supplierId: p.supplierId || null,
      expiry: p.expiry || null,
      dateType: p.dateType || 'best-before',
      updatedAt: Date.now(),
    };
    setProducts((prev) => { const next = [product, ...prev]; persist(next); return next; });
    return product;
  }, []);

  const updateProduct = useCallback((id, patch) => {
    setProducts((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p));
      persist(next);
      return next;
    });
  }, []);

  const removeProduct = useCallback((id) => {
    setProducts((prev) => { const next = prev.filter((p) => p.id !== id); persist(next); return next; });
  }, []);

  const findByBarcode = useCallback((barcode) => {
    const b = (barcode || '').trim();
    if (!b) return null;
    return load().find((p) => p.barcode && p.barcode === b) || null;
  }, []);

  /** Apply a goods-in delivery: lines = [{ barcode, name, cost, qty }].
   *  Known barcode → qty += received (+ cost update); unknown → create. */
  const receiveLines = useCallback((lines) => {
    setProducts((prev) => {
      const next = [...prev];
      for (const line of lines) {
        const addQty = Number(line.qty) || 0;
        const idx = line.barcode ? next.findIndex((p) => p.barcode && p.barcode === line.barcode.trim()) : -1;
        if (idx >= 0) {
          next[idx] = {
            ...next[idx],
            qty: (Number(next[idx].qty) || 0) + addQty,
            cost: line.cost === '' || line.cost == null ? next[idx].cost : Number(line.cost),
            updatedAt: Date.now(),
          };
        } else {
          next.unshift({
            id: newId(),
            barcode: (line.barcode || '').trim(),
            name: (line.name || '').trim() || 'New item',
            cost: line.cost === '' || line.cost == null ? null : Number(line.cost),
            price: null,
            qty: addQty,
            min: 0,
            updatedAt: Date.now(),
          });
        }
      }
      persist(next);
      return next;
    });
  }, []);

  return { products, addProduct, updateProduct, removeProduct, findByBarcode, receiveLines, commit };
}
