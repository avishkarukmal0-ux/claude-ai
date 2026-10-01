'use strict';

// Barcode → product-name/category lookup (infra: scan auto-fill). We proxy a public product database
// (Open Food Facts) from the BACKEND, not the browser: it keeps the call off the client (CORS + our strict
// CSP only allows our own API host), lets us set a proper User-Agent, and gives one place to add caching or
// swap providers later. Honest scope: good for packaged food & drink, patchy for tobacco/news/alcohol/vape.
// It only ever returns name/category/brand — never cost, price, stock or anything shop-specific.

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const FIELDS = 'product_name,brands,categories_tags';
const TIMEOUT_MS = 4000;

/** Turn an Open Food Facts category tag ("en:sweet-snacks") into a readable label ("Sweet snacks"). */
function labelFromTag(tag) {
  const raw = String(tag || '').replace(/^[a-z]{2}:/, '').replace(/-/g, ' ').trim();
  if (!raw) return null;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Pure mapper (unit-testable): Open Food Facts JSON → slim result. */
function mapOffProduct(json) {
  if (!json || json.status !== 1 || !json.product) return { found: false };
  const p = json.product;
  const name = (p.product_name || '').trim() || null;
  const brand = (p.brands || '').split(',')[0].trim() || null;
  const tags = Array.isArray(p.categories_tags) ? p.categories_tags : [];
  // The last tag is the most specific category.
  const category = tags.length ? labelFromTag(tags[tags.length - 1]) : null;
  if (!name && !category) return { found: false };
  return { found: true, name, category, brand, source: 'openfoodfacts' };
}

/** Look a barcode up. Resolves to { found, name?, category?, brand?, source? }; never throws. */
async function lookup(barcode) {
  const code = String(barcode || '').replace(/\D/g, '');
  if (!code || code.length < 6) return { found: false };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${OFF_BASE}/${code}.json?fields=${FIELDS}`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Vendora-POS/1.0 (UK convenience pilot)' },
    });
    if (!res.ok) return { found: false };
    const json = await res.json();
    return mapOffProduct(json);
  } catch {
    return { found: false }; // offline, timeout, bad JSON — caller just falls back to manual entry
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { lookup, mapOffProduct, labelFromTag };
