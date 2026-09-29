// Purchase-price change alerts — when a delivery changes a product's per-unit cost materially,
// we log an alert with the margin impact and a SUGGESTED retail price to hold the old margin.
// Retail changes are never applied automatically: they sit in this queue for the owner to approve.
// Framework-free core (unit-testable) + a thin hook. No import of inventoryStore (avoids a cycle).
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

const NAME = 'price_alerts_v1';
const MIN_ABS = 0.01;   // ignore sub-penny noise
const MIN_PCT = 0.05;   // and changes under 5%

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function persist(list) { return writeJSON(NAME, list); }
function newId() {
  try { if (crypto?.randomUUID) return `pa_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `pa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Gross margin (0–1) or null when not computable — unknown cost is not zero cost. */
export function marginOf(cost, price) {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return null;
  if (cost == null || cost === '' ) return null;
  const c = Number(cost);
  if (!Number.isFinite(c) || c < 0) return null;
  return (p - c) / p;
}

/** Retail that holds `targetMargin` at `newCost`, or null if not computable. */
export function retailForMargin(newCost, targetMargin) {
  if (targetMargin == null || targetMargin >= 1) return null;
  const c = Number(newCost);
  if (!Number.isFinite(c) || c < 0) return null;
  return r2(c / (1 - targetMargin));
}

/** Whether a cost change is worth alerting on. */
export function isMaterialCostChange(prevCost, newCost) {
  if (prevCost == null || newCost == null) return false;
  const a = Number(prevCost); const b = Number(newCost);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return false;
  return Math.abs(b - a) >= MIN_ABS && Math.abs((b - a) / a) >= MIN_PCT;
}

/**
 * Record a price-change alert if the per-unit cost moved materially. Called from the delivery
 * apply path. Returns the created alert or null. Does NOT change any retail price.
 */
export function recordCostChange({ productId, name, prevCost, newCost, price }) {
  if (!isMaterialCostChange(prevCost, newCost)) return null;
  const prevMargin = marginOf(prevCost, price);
  const newMargin = marginOf(newCost, price);
  const alert = {
    id: newId(), productId, name: name || 'Product',
    prevCost: r2(prevCost), newCost: r2(newCost),
    changePct: Math.round(((newCost - prevCost) / prevCost) * 100),
    price: price == null ? null : r2(price),
    prevMargin, newMargin,
    suggestedRetail: prevMargin != null ? retailForMargin(newCost, prevMargin) : null,
    status: 'open', at: Date.now(),
  };
  persist([alert, ...load()]);
  try { window.dispatchEvent(new CustomEvent('vendora:price-alerts')); } catch { /* ignore */ }
  return alert;
}

export function usePriceAlerts() {
  const [alerts, setAlerts] = useState(load);
  useEffect(() => {
    const refresh = () => setAlerts(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    window.addEventListener('vendora:price-alerts', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('vendora:workspace', refresh);
      window.removeEventListener('vendora:price-alerts', refresh);
    };
  }, []);

  const setStatus = useCallback((id, status) => {
    const next = load().map((a) => (a.id === id ? { ...a, status, resolvedAt: Date.now() } : a));
    persist(next); setAlerts(next);
    try { window.dispatchEvent(new CustomEvent('vendora:price-alerts')); } catch { /* ignore */ }
  }, []);

  const openAlerts = alerts.filter((a) => a.status === 'open');
  return { alerts, openAlerts, dismiss: (id) => setStatus(id, 'dismissed'), markApproved: (id) => setStatus(id, 'retail_approved') };
}
