// Re-point every historical reference from one product id to another (Phase 2.7f) — so merging two
// duplicate products NEVER strands their movements, claims, price history, invoice or delivery lines.
// Operates directly on the stored blobs (not the React hooks) and fires a workspace event so every live
// hook re-reads. Imports storage only, so there's no import cycle with inventoryStore.
import { readJSON, writeJSON, WORKSPACE_EVENT } from './storage';

// Where productId lives in each store: a top-level field, or on each item/line of every record.
const TOP_LEVEL = ['movements_v1', 'price_alerts_v1'];
const NESTED = [
  { name: 'claims_v1', arr: 'items' },
  { name: 'invoices_v1', arr: 'lines' },
  { name: 'deliveries_v1', arr: 'lines' },
];

function remapTopLevel(name, fromId, toId) {
  const rows = readJSON(name, []);
  if (!Array.isArray(rows)) return 0;
  let n = 0;
  const next = rows.map((r) => { if (r && r.productId === fromId) { n += 1; return { ...r, productId: toId }; } return r; });
  if (n) writeJSON(name, next);
  return n;
}

function remapNested(name, arrKey, fromId, toId) {
  const rows = readJSON(name, []);
  if (!Array.isArray(rows)) return 0;
  let n = 0;
  const next = rows.map((rec) => {
    const arr = rec && Array.isArray(rec[arrKey]) ? rec[arrKey] : null;
    if (!arr) return rec;
    let touched = false;
    const mapped = arr.map((it) => { if (it && it.productId === fromId) { touched = true; n += 1; return { ...it, productId: toId }; } return it; });
    return touched ? { ...rec, [arrKey]: mapped } : rec;
  });
  if (n) writeJSON(name, next);
  return n;
}

/**
 * Re-assign every reference to `fromId` so it points at `toId`, across all history stores.
 * Returns a per-store count of references moved. Caller (inventory merge) handles the product records.
 */
export function reassignProductRefs(fromId, toId) {
  const counts = {};
  if (!fromId || !toId || fromId === toId) return counts;
  for (const name of TOP_LEVEL) counts[name] = remapTopLevel(name, fromId, toId);
  for (const { name, arr } of NESTED) counts[name] = remapNested(name, arr, fromId, toId);
  try { window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT, { detail: { merged: true } })); } catch { /* non-browser */ }
  return counts;
}
