// Try-it-out demo data (Phase 2.6c) — a tiny sample shop the owner can explore before committing real
// data, kept in its OWN workspace so it is NEVER mixed with (or mistaken for) the real shop. Loading it
// switches the active workspace to `demo`; exiting purges that workspace entirely. The real guest/shop
// workspaces are untouched throughout.
import {
  read, write, writeJSON, setActiveWorkspace, getActiveWorkspace, purgeWorkspace, LOCAL_WORKSPACE,
} from './storage';

export const DEMO_WORKSPACE = 'demo';

export function isDemoActive() { return getActiveWorkspace() === DEMO_WORKSPACE; }

// Per-GROUP sample catalogues so each niche sees stock that fits it — not bread/milk/cola for everyone.
// Each set keeps at least one near use-by (pull/markdown), one near best-before and one low-stock line so the
// daily actions + expiry/low-stock tools always have something real to show. A few members override the set
// (e.g. an e-liquid for Vape & CBD, a cut of meat for Butcher). Dates are computed at load so they stay fresh.
function demoCatalogue(familyId, memberId) {
  const now = Date.now();
  const day = 86400000;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const base = { extraBarcodes: [], supplierAliases: [], shelfQty: null, countedAt: null, createdAt: now, lastSoldAt: null, updatedAt: now, batches: [] };
  const P = (id, p) => ({ ...base, id: `demo-${id}`, ...p });

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

  // Member-specific swaps (the group set otherwise applies).
  const set = SETS[familyId] || SETS['grocery-age'];
  const products = set.products.slice();
  if (memberId === 'vape-cbd') {
    products[0] = P('eliquid', { name: 'Demo E-liquid 10ml 10mg', barcode: 'D-ELIQ', category: 'Vape', qty: 15, min: 6, cost: 1.80, price: 3.99, size: 10, sizeUnit: 'ml' });
  } else if (memberId === 'pet-shop') {
    products[1] = P('petworm', { name: 'Demo Wormer Tablets', barcode: 'D-WORM', category: 'Pet medicine', qty: 8, min: 4, cost: 2.50, price: 5.50, distCategory: 'NFA-VPS' });
  }
  return { products, supplier: set.supplier };
}

/** Load the sample shop into the demo workspace and switch to it. Carries the picked shop type across so
 *  the app renders, and picks the demo catalogue that fits that shop type. Returns { ok }. */
export function loadDemo() {
  const cur = getActiveWorkspace();
  const shopType = read('shop_type', null, cur) || read('shop_type', null, LOCAL_WORKSPACE) || 'grocery-age';
  const [familyId, memberId = null] = String(shopType).split(':');
  write('shop_type', shopType, DEMO_WORKSPACE);
  const { products, supplier } = demoCatalogue(familyId, memberId);
  writeJSON('inventory_v1', products, DEMO_WORKSPACE);
  writeJSON('suppliers_v1', [{ id: 'demo-sup', name: supplier, createdAt: Date.now() }], DEMO_WORKSPACE);
  setActiveWorkspace(DEMO_WORKSPACE);
  return { ok: true };
}

/** Leave the demo: wipe the demo workspace and return to the real on-device (guest) workspace. */
export function exitDemo() {
  purgeWorkspace(DEMO_WORKSPACE);
  setActiveWorkspace(LOCAL_WORKSPACE);
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
