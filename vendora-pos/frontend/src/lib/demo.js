// Try-it-out demo data (Phase 2.6c) — a tiny sample shop the owner can explore before committing real
// data, kept in its OWN workspace so it is NEVER mixed with (or mistaken for) the real shop. Loading it
// switches the active workspace to `demo`; exiting purges that workspace entirely. The real guest/shop
// workspaces are untouched throughout.
import {
  read, write, writeJSON, setActiveWorkspace, getActiveWorkspace, purgeWorkspace, LOCAL_WORKSPACE,
} from './storage';

export const DEMO_WORKSPACE = 'demo';
// Remember the workspace the owner was in before entering the demo, so Exit demo returns them there (not to the
// guest workspace, which would dump a signed-in owner on the shop-type picker). Global key, not workspace-scoped.
const PRE_DEMO_KEY = 'vendora:workspace_before_demo';

export function isDemoActive() { return getActiveWorkspace() === DEMO_WORKSPACE; }

// Per-GROUP sample catalogues so each niche sees stock that fits it — not bread/milk/cola for everyone.
// Each set keeps at least one near use-by (pull/markdown), one near best-before and one low-stock line so the
// daily actions + expiry/low-stock tools always have something real to show. A few members override the set
// (e.g. an e-liquid for Vape & CBD, a cut of meat for Butcher). Dates are computed at load so they stay fresh.
export function demoCatalogue(familyId, memberId) {
  const now = Date.now();
  const day = 86400000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const base = { extraBarcodes: [], supplierAliases: [], shelfQty: null, countedAt: null, createdAt: now, lastSoldAt: null, updatedAt: now, batches: [] };
  // Demo products need REAL (numeric) barcodes so the typed-lookup path (8–14 digits) can find them — the old
  // D-COLA style codes aren't valid EANs. Derive a stable EAN-13 from the id (prefix "20" = in-store range,
  // then a hash, then the EAN-13 check digit). Deterministic, so the same demo product keeps the same code.
  const demoEan = (seed) => {
    let h = 5381;
    for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0;
    const body = ('20' + String(h).padStart(10, '0')).slice(0, 12);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
    return body + ((10 - (sum % 10)) % 10);
  };
  const numeric = (v) => /^\d{8,14}$/.test(String(v || ''));
  const P = (id, p) => {
    const out = { ...base, id: `demo-${id}`, ...p, barcode: numeric(p.barcode) ? p.barcode : demoEan(`demo-${id}`) };
    if (p.caseBarcode != null) out.caseBarcode = numeric(p.caseBarcode) ? p.caseBarcode : demoEan(`demo-${id}-case`);
    return out;
  };

  const SETS = {
    'grocery-age': {
      supplier: 'Bestway (demo)',
      products: [
        P('cola', { name: 'Demo Cola 330ml', barcode: 'D-COLA', caseBarcode: 'D-COLA-CASE', packSize: 24, category: 'Soft drinks', qty: 48, min: 12, cost: 0.35, price: 0.85 }),
        P('milk', { name: 'Demo Fresh Milk 2L', barcode: 'D-MILK', category: 'Chilled', qty: 3, min: 6, cost: 1.10, price: 1.65, expiry: iso(now + 2 * day), dateType: 'use-by' }),
        P('bread', { name: 'Demo Bread 800g', barcode: 'D-BREAD', category: 'Bakery', qty: 2, min: 8, cost: 0.55, price: 1.20, expiry: iso(now + 1 * day), dateType: 'best-before' }),
        P('crisp', { name: 'Demo Crisps Multipack', barcode: 'D-CRISP', category: 'Snacks', qty: 20, min: 6, cost: 1.50, price: 2.50 }),
      ],
    },
    'fresh-weighed': {
      supplier: 'New Covent Garden Market (demo)',
      products: [
        P('loaf', { name: 'Demo Sourdough Loaf', barcode: 'D-SOUR', category: 'Bakery', qty: 4, min: 6, cost: 0.90, price: 2.40, expiry: iso(now + 1 * day), dateType: 'best-before' }),
        P('mince', { name: 'Demo Beef Mince 500g', barcode: 'D-MINCE', category: 'Meat', qty: 3, min: 6, cost: 2.10, price: 3.75, expiry: iso(now + 2 * day), dateType: 'use-by' }),
        P('apples', { name: 'Demo Loose Apples', barcode: 'D-APPLE', category: 'Produce', qty: 40, min: 15, cost: 0.12, price: 0.30, size: 1, sizeUnit: 'kg' }),
        P('brie', { name: 'Demo Brie Wedge 200g', barcode: 'D-BRIE', category: 'Deli', qty: 5, min: 4, cost: 1.30, price: 2.80, expiry: iso(now + 4 * day), dateType: 'use-by' }),
      ],
    },
    'world-specialist': {
      supplier: 'Import Wholesale (demo)',
      products: [
        P('basmati', { name: 'Demo Basmati Rice 5kg', barcode: 'D-RICE', category: 'Dry goods', qty: 12, min: 6, cost: 5.50, price: 8.99, size: 5, sizeUnit: 'kg' }),
        P('dates', { name: 'Demo Medjool Dates 400g', barcode: 'D-DATES', category: 'Dry goods', qty: 3, min: 6, cost: 1.80, price: 3.50, expiry: iso(now + 10 * day), dateType: 'best-before' }),
        P('spice', { name: 'Demo Garam Masala 100g', barcode: 'D-SPICE', category: 'Spices', qty: 20, min: 8, cost: 0.60, price: 1.75 }),
        P('paneer', { name: 'Demo Paneer 226g', barcode: 'D-PANEER', category: 'Chilled', qty: 4, min: 6, cost: 1.40, price: 2.50, expiry: iso(now + 3 * day), dateType: 'use-by' }),
      ],
    },
    'mobile-value': {
      supplier: 'Cash & Carry (demo)',
      products: [
        P('dogfood', { name: 'Demo Dog Food 2kg', barcode: 'D-DOG', category: 'Pet', qty: 10, min: 4, cost: 2.20, price: 4.00, size: 2, sizeUnit: 'kg' }),
        P('charger', { name: 'Demo Phone Charger', barcode: 'D-CHRG', category: 'Electrical', qty: 2, min: 5, cost: 1.10, price: 3.00 }),
        P('roll', { name: 'Demo Kitchen Roll 2pk', barcode: 'D-ROLL', category: 'Household', qty: 18, min: 6, cost: 0.80, price: 1.50 }),
        P('litter', { name: 'Demo Cat Litter 5L', barcode: 'D-LITT', category: 'Pet', qty: 6, min: 4, cost: 1.60, price: 3.25, size: 5, sizeUnit: 'L' }),
      ],
    },
  };

  // Member-specific FULL sets where the shop sells quite different stock from its group's default — so an
  // Off-licence shows drinks and a Vape & CBD shop shows vape/CBD lines, not bread/milk.
  const MEMBER_SETS = {
    'off-licence': {
      supplier: 'Bestway (demo)',
      products: [
        P('lager', { name: 'Demo Lager 4×440ml', barcode: 'D-LAGER', category: 'Beer', qty: 24, min: 12, cost: 3.20, price: 5.50, abv: 4.5, size: 1.76, sizeUnit: 'L' }),
        P('wine', { name: 'Demo Red Wine 75cl', barcode: 'D-WINE', category: 'Wine', qty: 4, min: 6, cost: 4.10, price: 7.99, abv: 13, size: 0.75, sizeUnit: 'L' }),
        P('vodka', { name: 'Demo Vodka 70cl', barcode: 'D-VODKA', category: 'Spirits', qty: 6, min: 4, cost: 11.00, price: 16.99, abv: 37.5, size: 0.7, sizeUnit: 'L' }),
        P('mixer', { name: 'Demo Tonic 1L', barcode: 'D-TONIC', category: 'Mixers', qty: 18, min: 8, cost: 0.55, price: 1.25, size: 1, sizeUnit: 'L' }),
      ],
    },
    'vape-cbd': {
      supplier: 'Vape Wholesale (demo)',
      products: [
        P('eliquid', { name: 'Demo E-liquid 10ml 10mg', barcode: 'D-ELIQ', category: 'Vape', qty: 15, min: 6, cost: 1.80, price: 3.99, size: 10, sizeUnit: 'ml' }),
        P('nicsalt', { name: 'Demo Nic Salt 10ml 20mg', barcode: 'D-NSALT', category: 'Vape', qty: 4, min: 8, cost: 2.10, price: 4.50, size: 10, sizeUnit: 'ml' }),
        P('podkit', { name: 'Demo Refillable Pod Kit', barcode: 'D-POD', category: 'Vape hardware', qty: 9, min: 4, cost: 6.00, price: 12.99 }),
        P('cbd', { name: 'Demo CBD Oil 500mg', barcode: 'D-CBD', category: 'CBD', qty: 6, min: 4, cost: 7.50, price: 14.99, size: 10, sizeUnit: 'ml' }),
      ],
    },
  };
  if (MEMBER_SETS[memberId]) return { products: MEMBER_SETS[memberId].products, supplier: MEMBER_SETS[memberId].supplier };

  // Otherwise the group set, with a small member swap where it helps.
  const set = SETS[familyId] || SETS['grocery-age'];
  const products = set.products.slice();
  if (memberId === 'pet-shop') {
    products[1] = P('petworm', { name: 'Demo Wormer Tablets', barcode: 'D-WORM', category: 'Pet medicine', qty: 8, min: 4, cost: 2.50, price: 5.50, distCategory: 'NFA-VPS' });
  }
  return { products, supplier: set.supplier };
}

/** Load the sample shop into the demo workspace and switch to it. Carries the picked shop type across so
 *  the app renders, and picks the demo catalogue that fits that shop type. Returns { ok }. */
export function loadDemo() {
  const cur = getActiveWorkspace();
  // Remember where we came from (unless we're somehow already in demo) so Exit demo can restore it.
  if (cur !== DEMO_WORKSPACE) { try { localStorage.setItem(PRE_DEMO_KEY, cur); } catch { /* ignore */ } }
  const shopType = read('shop_type', null, cur) || read('shop_type', null, LOCAL_WORKSPACE) || 'grocery-age';
  const [familyId, memberId = null] = String(shopType).split(':');
  write('shop_type', shopType, DEMO_WORKSPACE);
  const { products, supplier } = demoCatalogue(familyId, memberId);
  writeJSON('inventory_v1', products, DEMO_WORKSPACE);
  writeJSON('suppliers_v1', [{ id: 'demo-sup', name: supplier, createdAt: Date.now() }], DEMO_WORKSPACE);
  setActiveWorkspace(DEMO_WORKSPACE);
  return { ok: true };
}

/** Reload the demo catalogue for the CURRENT shop type (used when the type changed while in demo, so a Pet
 *  shop stops showing the grocery sample). No-op outside demo. Replaces the sample inventory + supplier only. */
export function reloadDemoData() {
  if (!isDemoActive()) return { ok: false };
  const shopType = read('shop_type', 'grocery-age', DEMO_WORKSPACE) || 'grocery-age';
  const [familyId, memberId = null] = String(shopType).split(':');
  const { products, supplier } = demoCatalogue(familyId, memberId);
  writeJSON('inventory_v1', products, DEMO_WORKSPACE);
  writeJSON('suppliers_v1', [{ id: 'demo-sup', name: supplier, createdAt: Date.now() }], DEMO_WORKSPACE);
  return { ok: true };
}

/** Does the demo's loaded sample no longer fit the saved shop type? (e.g. type switched to Pet shop but the
 *  inventory is still the grocery sample.) Cheap heuristic: compare the first demo product id's prefix. */
export function demoDataStale() {
  if (!isDemoActive()) return false;
  const shopType = read('shop_type', 'grocery-age', DEMO_WORKSPACE) || 'grocery-age';
  const [familyId, memberId = null] = String(shopType).split(':');
  const want = demoCatalogue(familyId, memberId).products.map((p) => p.id).sort();
  let have = [];
  try { const inv = JSON.parse(read('inventory_v1', '[]', DEMO_WORKSPACE) || '[]'); have = (Array.isArray(inv) ? inv : []).map((p) => p.id).sort(); } catch { /* ignore */ }
  return want.join(',') !== have.join(',');
}

/** Leave the demo: wipe the demo workspace and return to the real on-device (guest) workspace. */
export function exitDemo() {
  purgeWorkspace(DEMO_WORKSPACE);
  // Restore the workspace the owner was in before the demo (their shop:<id> when signed in), falling back to
  // the guest workspace. Never restore into the demo itself.
  let prev = LOCAL_WORKSPACE;
  try { prev = localStorage.getItem(PRE_DEMO_KEY) || LOCAL_WORKSPACE; } catch { /* ignore */ }
  if (prev === DEMO_WORKSPACE) prev = LOCAL_WORKSPACE;
  setActiveWorkspace(prev);
  try { localStorage.removeItem(PRE_DEMO_KEY); } catch { /* ignore */ }
  return { ok: true };
}

/**
 * Signed-out visitors must experience Vendora on SAMPLE data only — never real data. When accounts are enabled
 * and nobody is signed in, switch to the demo (sample) workspace so the open "welcome" space shows sample data,
 * not any real guest/shop data. Real data loads only after login (its own account workspace). No-op when signed
 * in, when accounts are disabled, or when the demo is already active. Returns true if it switched into demo.
 */
export function ensureSignedOutSampleMode({ loggedIn, accountsEnabled } = {}) {
  if (!accountsEnabled || loggedIn || isDemoActive()) return false;
  loadDemo();
  return true;
}
