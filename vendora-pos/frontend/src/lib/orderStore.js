// Purchase orders — the buying lifecycle: draft → ordered → partially_received → received /
// cancelled. Scoped to the active workspace. Stock is NOT changed here; receiving stock is the
// delivery's job (Stage 2). Orders track fulfilment (receivedQty) and "incoming" stock so
// reorder suggestions don't duplicate what's already on order.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

const NAME = 'orders_v1';
export const OPEN_STATUSES = ['ordered', 'partially_received'];

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function persist(list) { return writeJSON(NAME, list); }
function newId(p = 'o') {
  try { if (crypto?.randomUUID) return `${p}_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const num = (v) => (v === '' || v == null ? 0 : Number(v) || 0);

// ---- pure helpers (unit-tested) -------------------------------------------
export function orderTotals(order) {
  const lines = order.lines || [];
  let ordered = 0; let received = 0; let cost = 0;
  for (const l of lines) {
    ordered += num(l.qty);
    received += Math.min(num(l.receivedQty), num(l.qty));
    cost += num(l.qty) * num(l.unitCost);
  }
  return { ordered, received, remaining: Math.max(0, ordered - received), cost: Math.round(cost * 100) / 100, lineCount: lines.length };
}

/** Derive lifecycle status from fulfilment (never overrides a cancellation). */
export function statusFor(order) {
  if (order.status === 'cancelled') return 'cancelled';
  const { ordered, received } = orderTotals(order);
  if (order.orderedAt == null) return 'draft';
  if (ordered > 0 && received >= ordered) return 'received';
  if (received > 0) return 'partially_received';
  return 'ordered';
}

const keyOf = (l) => (l.productId || l.barcode || l.name);

/** Outstanding (on-order, not yet received) units per product — the "incoming" stock. */
export function incomingByProduct(orders) {
  const map = {};
  for (const o of orders) {
    if (!OPEN_STATUSES.includes(statusFor(o))) continue;
    for (const l of (o.lines || [])) {
      const outstanding = Math.max(0, num(l.qty) - num(l.receivedQty));
      if (outstanding <= 0) continue;
      const k = keyOf(l);
      map[k] = (map[k] || 0) + outstanding;
    }
  }
  return map;
}

/** Outstanding units for a single product (by id or barcode). */
export function incomingFor(orders, product) {
  const map = incomingByProduct(orders);
  return (map[product.id] || 0) + (product.barcode ? (map[product.barcode] || 0) : 0);
}

// ---- hook -----------------------------------------------------------------
export function useOrders() {
  const [orders, setOrders] = useState(load);

  useEffect(() => {
    const refresh = () => setOrders(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    window.addEventListener('vendora:orders', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('vendora:workspace', refresh);
      window.removeEventListener('vendora:orders', refresh);
    };
  }, []);

  const persistAll = (next) => { persist(next); setOrders(next); try { window.dispatchEvent(new CustomEvent('vendora:orders')); } catch { /* ignore */ } };

  /**
   * Create an order. `sent` distinguishes RECORDING an order (a draft — `orderedAt` null, you have not
   * told the supplier) from SENDING it (placed — `orderedAt` set). Default `sent: true` keeps existing
   * callers' behaviour. Nothing is ever transmitted to a supplier here; "sent" only records that YOU sent it.
   * lines: [{productId,barcode,name,qty,unitCost}].
   */
  const createOrder = useCallback(({ supplierId = null, supplierName = '', lines = [], note = '', sent = true }) => {
    const order = {
      id: newId(),
      status: sent ? 'ordered' : 'draft',
      supplierId, supplierName, note,
      createdAt: Date.now(), orderedAt: sent ? Date.now() : null, receivedAt: null,
      lines: lines.filter((l) => num(l.qty) > 0).map((l) => ({
        id: newId('ol'), productId: l.productId || null, barcode: l.barcode || '', name: l.name || 'Item',
        qty: num(l.qty), receivedQty: 0, unitCost: l.unitCost === '' || l.unitCost == null ? null : num(l.unitCost),
      })),
    };
    persistAll([order, ...load()]);
    return order;
  }, []);

  /** Record an order WITHOUT sending it to the supplier (a draft). */
  const createDraftOrder = useCallback((o) => createOrder({ ...o, sent: false }), [createOrder]);

  /** Mark a recorded draft order as sent to the supplier (an explicit, manual action — never automatic). */
  const sendOrder = useCallback((id) => {
    persistAll(load().map((o) => (o.id === id && o.orderedAt == null
      ? { ...o, status: 'ordered', orderedAt: Date.now(), updatedAt: Date.now() }
      : o)));
  }, []);

  const cancelOrder = useCallback((id) => {
    persistAll(load().map((o) => (o.id === id ? { ...o, status: 'cancelled', updatedAt: Date.now() } : o)));
  }, []);

  const removeOrder = useCallback((id) => { persistAll(load().filter((o) => o.id !== id)); }, []);

  /** Record receipts against an order (from a delivery). receipts: [{productId?,barcode?,qty}]. */
  const receiveAgainst = useCallback((id, receipts) => {
    const next = load().map((o) => {
      if (o.id !== id) return o;
      const lines = o.lines.map((l) => {
        const r = receipts.find((x) => (x.productId && x.productId === l.productId) || (x.barcode && x.barcode === l.barcode));
        if (!r) return l;
        // Apply a SIGNED correction (a negative qty "un-receives" a mistaken receipt), clamped to
        // [0, ordered] so received can't go below zero or above what was ordered (audit W7).
        const nextReceived = num(l.receivedQty) + num(r.qty);
        return { ...l, receivedQty: Math.max(0, Math.min(num(l.qty), nextReceived)) };
      });
      const updated = { ...o, lines, updatedAt: Date.now() };
      const st = statusFor(updated);
      return { ...updated, status: st, receivedAt: st === 'received' ? Date.now() : o.receivedAt };
    });
    persistAll(next);
  }, []);

  /** Force-complete an order (mark everything received). */
  const markReceived = useCallback((id) => {
    persistAll(load().map((o) => (o.id === id
      ? { ...o, lines: o.lines.map((l) => ({ ...l, receivedQty: num(l.qty) })), status: 'received', receivedAt: Date.now(), updatedAt: Date.now() }
      : o)));
  }, []);

  return { orders, createOrder, createDraftOrder, sendOrder, cancelOrder, removeOrder, receiveAgainst, markReceived };
}
