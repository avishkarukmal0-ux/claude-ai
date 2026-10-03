// Re-point every historical reference from one product id to another (Phase 2.7f) — so merging two
// duplicate products NEVER strands their movements, claims, price history, invoice/delivery lines, orders,
// buy-list rows, markdowns or stock counts. Operates directly on the stored blobs (not the React hooks) and
// fires a workspace event so every live hook re-reads. Imports storage only, so there's no import cycle with
// inventoryStore.
import { readJSON, writeJSON, WORKSPACE_EVENT } from './storage';

// Where productId lives in each store: a top-level field on each row, or on each item/line of every record.
const TOP_LEVEL = ['movements_v1', 'price_alerts_v1', 'markdowns_v1'];
const NESTED = [
  { name: 'claims_v1', arr: 'items' },
  { name: 'invoices_v1', arr: 'lines' },
  { name: 'deliveries_v1', arr: 'lines' },
  { name: 'orders_v1', arr: 'lines' },                 // Audit D7: orders were stranded on merge
  { name: 'stocktake_history_v1', arr: 'lines' },      // Audit D7: past-count rows kept linked
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

// Audit D7: the buy list keeps ONE row per product (addItem merges by productId). Re-pointing fromId→toId can
// therefore land on an existing toId row — merge the two (sum qty; only still "bought" if both were) so the
// store's one-row-per-product invariant holds and the merged product's buy quantity isn't lost.
function remapBuyList(fromId, toId) {
  const rows = readJSON('buylist_v1', []);
  if (!Array.isArray(rows) || !rows.some((r) => r && r.productId === fromId)) return 0;
  let n = 0;
  const out = [];
  const indexByProduct = new Map();
  for (const r of rows) {
    if (!r) continue;
    const row = r.productId === fromId ? (n += 1, { ...r, productId: toId }) : { ...r };
    if (row.productId && indexByProduct.has(row.productId)) {
      const tgt = out[indexByProduct.get(row.productId)];
      tgt.qty = (Number(tgt.qty) || 0) + (Number(row.qty) || 0);
      tgt.bought = Boolean(tgt.bought) && Boolean(row.bought);
      continue;
    }
    if (row.productId) indexByProduct.set(row.productId, out.length);
    out.push(row);
  }
  if (n) writeJSON('buylist_v1', out);
  return n;
}

// Audit D7: the active stock-count session stores counts/expected/reasons as MAPS keyed by productId, not rows
// with a productId field — so a key must be renamed, and merged into any existing toId key (sum the counted and
// expected quantities; keep a non-empty reason). Past sessions (history) are handled as NESTED lines above.
function remapStocktakeSession(fromId, toId) {
  const s = readJSON('stocktake_v1', null);
  if (!s || typeof s !== 'object' || Array.isArray(s)) return 0;
  let touched = 0;
  const moveKey = (mapName, combine) => {
    const m = s[mapName];
    if (!m || typeof m !== 'object' || !(fromId in m)) return;
    const next = { ...m };
    const moved = next[fromId];
    delete next[fromId];
    next[toId] = (toId in m) ? combine(m[toId], moved) : moved;
    s[mapName] = next;
    touched += 1;
  };
  moveKey('counts', (a, b) => (Number(a) || 0) + (Number(b) || 0));
  moveKey('expected', (a, b) => (Number(a) || 0) + (Number(b) || 0));
  moveKey('reasons', (a, b) => (a && String(a).trim() ? a : b));
  if (touched) writeJSON('stocktake_v1', s);
  return touched ? 1 : 0;
}

/**
 * Re-assign every reference to `fromId` so it points at `toId`, across all history + working stores.
 * Returns a per-store count of references moved. Caller (inventory merge) handles the product records.
 */
export function reassignProductRefs(fromId, toId) {
  const counts = {};
  if (!fromId || !toId || fromId === toId) return counts;
  for (const name of TOP_LEVEL) counts[name] = remapTopLevel(name, fromId, toId);
  for (const { name, arr } of NESTED) counts[name] = remapNested(name, arr, fromId, toId);
  counts.buylist_v1 = remapBuyList(fromId, toId);
  counts.stocktake_v1 = remapStocktakeSession(fromId, toId);
  try { window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT, { detail: { merged: true } })); } catch { /* non-browser */ }
  return counts;
}
