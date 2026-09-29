// Local-first inventory store — real, working stock data saved on the device.
// No backend yet: persists to localStorage so it survives reloads and works offline.
// When the backend lands, this same shape syncs up. Every mutation re-persists.
import { useCallback, useEffect, useState } from 'react';
import { recordSale } from './movementStore';

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

/** Days since the product last moved (sold), else since it was added; null if unknown. */
export function daysSinceMovement(p, from = Date.now()) {
  const ref = p.lastSoldAt || p.createdAt;
  if (!ref) return null;
  return Math.floor((from - ref) / 86400000);
}

/** Slow / dead stock: in stock but no movement for `days`+. */
export function isSlowStock(p, days = 30) {
  if ((Number(p.qty) || 0) <= 0) return false;
  const d = daysSinceMovement(p);
  return d != null && d >= days;
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
      createdAt: Date.now(),
      lastSoldAt: null,
      updatedAt: Date.now(),
    };
    setProducts((prev) => { const next = [product, ...prev]; persist(next); return next; });
    return product;
  }, []);

  const updateProduct = useCallback((id, patch) => {
    let soldUnits = 0;
    setProducts((prev) => {
      const next = prev.map((p) => {
        if (p.id !== id) return p;
        // A qty drop is a "sale/movement" — stamp lastSoldAt so slow-stock ageing
        // works, and capture the units so velocity/reorder can reason about it.
        const soldNow = patch.qty != null && Number(patch.qty) < (Number(p.qty) || 0);
        if (soldNow) soldUnits = (Number(p.qty) || 0) - Number(patch.qty);
        return { ...p, ...patch, ...(soldNow ? { lastSoldAt: Date.now() } : {}), updatedAt: Date.now() };
      });
      persist(next);
      return next;
    });
    // Log the sale after the state update (keeps the updater pure).
    if (soldUnits > 0) recordSale(id, soldUnits);
  }, []);

  const removeProduct = useCallback((id) => {
    setProducts((prev) => { const next = prev.filter((p) => p.id !== id); persist(next); return next; });
  }, []);

  /** Apply stocktake counts: set exact qty for each id. A count is a CORRECTION,
   *  not a sale — so this never records a movement or stamps lastSoldAt. */
  const setCounts = useCallback((counts) => {
    setProducts((prev) => {
      const next = prev.map((p) => (
        counts[p.id] != null ? { ...p, qty: Math.max(0, Number(counts[p.id]) || 0), updatedAt: Date.now() } : p
      ));
      persist(next);
      return next;
    });
  }, []);

  /** Bulk import products (from CSV). Skips rows whose barcode already exists.
   *  Persists synchronously (the import screen may unmount right after), then
   *  updates state. Returns { added, skipped }. */
  const importProducts = useCallback((rows) => {
    const prev = load();
    const seen = new Set(prev.filter((p) => p.barcode).map((p) => p.barcode));
    let added = 0; let skipped = 0;
    const created = [];
    for (const r of rows) {
      const barcode = (r.barcode || '').trim();
      if (barcode && seen.has(barcode)) { skipped++; continue; }
      if (barcode) seen.add(barcode);
      created.push({
        id: newId(),
        barcode,
        name: (r.name || '').trim() || 'Unnamed item',
        cost: r.cost === '' || r.cost == null ? null : Number(r.cost),
        price: r.price === '' || r.price == null ? null : Number(r.price),
        qty: Number(r.qty) || 0,
        min: 0,
        supplierId: null,
        expiry: null,
        dateType: 'best-before',
        createdAt: Date.now(),
        lastSoldAt: null,
        updatedAt: Date.now(),
      });
      added++;
    }
    const next = [...created, ...prev];
    persist(next);      // synchronous — not dependent on a React update running
    setProducts(next);
    return { added, skipped };
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
            supplierId: null,
            expiry: null,
            dateType: 'best-before',
            createdAt: Date.now(),
            lastSoldAt: null,
            updatedAt: Date.now(),
          });
        }
      }
      persist(next);
      return next;
    });
  }, []);

  return { products, addProduct, updateProduct, removeProduct, setCounts, findByBarcode, receiveLines, importProducts, commit };
}
