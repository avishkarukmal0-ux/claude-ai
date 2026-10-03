// Try-it-out demo data (Phase 2.6c) — a tiny sample shop the owner can explore before committing real
// data, kept in its OWN workspace so it is NEVER mixed with (or mistaken for) the real shop. Loading it
// switches the active workspace to `demo`; exiting purges that workspace entirely. The real guest/shop
// workspaces are untouched throughout.
import {
  read, write, writeJSON, setActiveWorkspace, getActiveWorkspace, purgeWorkspace, LOCAL_WORKSPACE,
} from './storage';

export const DEMO_WORKSPACE = 'demo';

export function isDemoActive() { return getActiveWorkspace() === DEMO_WORKSPACE; }

// A small, varied catalogue so the daily actions + expiry/low-stock tools have something real to show.
// Dates are computed at load time so "expiring soon" is always relevant.
function demoProducts() {
  const now = Date.now();
  const day = 86400000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const base = { extraBarcodes: [], supplierAliases: [], shelfQty: null, countedAt: null, createdAt: now, lastSoldAt: null, updatedAt: now, batches: [] };
  return [
    { ...base, id: 'demo-p1', name: 'Demo Cola 330ml', barcode: 'D-COLA', caseBarcode: 'D-COLA-CASE', packSize: 24, category: 'Soft drinks', qty: 48, min: 12, cost: 0.35, price: 0.85 },
    { ...base, id: 'demo-p2', name: 'Demo Fresh Milk 2L', barcode: 'D-MILK', category: 'Chilled', qty: 3, min: 6, cost: 1.10, price: 1.65, expiry: iso(now + 2 * day), dateType: 'use-by' }, // expiring + low
    { ...base, id: 'demo-p3', name: 'Demo Bread 800g', barcode: 'D-BREAD', category: 'Bakery', qty: 2, min: 8, cost: 0.55, price: 1.20, expiry: iso(now + 1 * day), dateType: 'best-before' }, // markdown + low
    { ...base, id: 'demo-p4', name: 'Demo Crisps Multipack', barcode: 'D-CRISP', category: 'Snacks', qty: 20, min: 6, cost: 1.50, price: 2.50 },
  ];
}

/** Load the sample shop into the demo workspace and switch to it. Carries the picked shop type across so
 *  the app renders. Returns { ok }. */
export function loadDemo() {
  const cur = getActiveWorkspace();
  const shopType = read('shop_type', null, cur) || read('shop_type', null, LOCAL_WORKSPACE) || 'convenience';
  write('shop_type', shopType, DEMO_WORKSPACE);
  writeJSON('inventory_v1', demoProducts(), DEMO_WORKSPACE);
  writeJSON('suppliers_v1', [{ id: 'demo-sup', name: 'Bestway (demo)', createdAt: Date.now() }], DEMO_WORKSPACE);
  setActiveWorkspace(DEMO_WORKSPACE);
  return { ok: true };
}

/** Leave the demo: wipe the demo workspace and return to the real on-device (guest) workspace. */
export function exitDemo() {
  purgeWorkspace(DEMO_WORKSPACE);
  setActiveWorkspace(LOCAL_WORKSPACE);
  return { ok: true };
}
