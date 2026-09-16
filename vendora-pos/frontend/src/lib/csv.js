// Minimal CSV parsing for product import (old EPOS / spreadsheet export).
// Handles quoted fields, escaped quotes, and CRLF. No dependency.

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += c;
    } else if (c === '"') {
      q = true;
    } else if (c === ',') {
      row.push(cur); cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else {
      cur += c;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => (x || '').trim() !== ''));
}

const SYNONYMS = {
  name: ['name', 'product', 'description', 'item', 'title', 'product name'],
  barcode: ['barcode', 'ean', 'upc', 'sku', 'code', 'bar code'],
  cost: ['cost', 'buy', 'wholesale', 'cost price', 'costprice', 'buy price'],
  price: ['price', 'sell', 'retail', 'rrp', 'sell price', 'sellprice', 'sale price'],
  qty: ['qty', 'quantity', 'stock', 'on hand', 'onhand', 'count', 'in stock'],
};

function matchField(header) {
  const h = (header || '').trim().toLowerCase();
  for (const [field, alts] of Object.entries(SYNONYMS)) {
    if (alts.includes(h)) return field;
  }
  return null;
}

/** Turn raw CSV rows into product objects. Detects a header row; else assumes
 *  positional order: name, barcode, cost, price, qty. */
export function toProductRows(rows) {
  if (!rows.length) return [];
  const first = rows[0].map(matchField);
  const hasHeader = first.some((f) => f !== null);
  let map;
  let dataRows;
  if (hasHeader) {
    map = {};
    first.forEach((f, i) => { if (f && map[f] == null) map[f] = i; });
    dataRows = rows.slice(1);
  } else {
    map = { name: 0, barcode: 1, cost: 2, price: 3, qty: 4 };
    dataRows = rows;
  }
  const num = (v) => {
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : '';
  };
  return dataRows
    .map((r) => ({
      name: (map.name != null ? r[map.name] : '')?.trim() || '',
      barcode: (map.barcode != null ? r[map.barcode] : '')?.trim() || '',
      cost: map.cost != null ? num(r[map.cost]) : '',
      price: map.price != null ? num(r[map.price]) : '',
      qty: map.qty != null ? num(r[map.qty]) : '',
    }))
    .filter((p) => p.name); // a product needs at least a name
}
