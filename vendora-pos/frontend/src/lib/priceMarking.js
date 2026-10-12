// Price Marking Order helper (Phase 1.7). UK shelf prices are shown to the customer INCLUDING VAT, and a unit
// price (per kg / litre / 100g / 100ml) must be shown where applicable. This computes the unit price from a
// product's pack size so labels and price displays can show it. Rule text + source live in data/compliance.js
// (id 'pmo'); this is just the maths. Pure + unit-tested.
const num = (v) => (v === '' || v == null ? NaN : Number(v));

/**
 * Unit price for a product with { price, size, sizeUnit }. Returns { value, unit, text } or null when there
 * isn't enough to compute. kg/L are priced per kg/L; g/ml per 100g/100ml (how shops usually show small packs).
 */
export function unitPrice(product) {
  if (!product) return null;
  const price = num(product.price);
  const size = num(product.size);
  if (!Number.isFinite(price) || !Number.isFinite(size) || size <= 0) return null;
  const u = String(product.sizeUnit || '').toLowerCase();
  let per; let unit;
  if (u === 'kg') { per = price / size; unit = 'kg'; }
  else if (u === 'l') { per = price / size; unit = 'L'; }
  else if (u === 'g') { per = (price / size) * 100; unit = '100g'; }
  else if (u === 'ml') { per = (price / size) * 100; unit = '100ml'; }
  else return null;
  return { value: per, unit, text: `£${per.toFixed(2)}/${unit}` };
}

/** "£1.20 incl. VAT · £0.30/kg" style label. `incVat` appends the VAT-inclusive reminder. */
export function priceLabel(product, { incVat = true } = {}) {
  const price = num(product?.price);
  if (!Number.isFinite(price)) return '';
  const parts = [`£${price.toFixed(2)}${incVat ? ' incl. VAT' : ''}`];
  const up = unitPrice(product);
  if (up) parts.push(up.text);
  return parts.join(' · ');
}
