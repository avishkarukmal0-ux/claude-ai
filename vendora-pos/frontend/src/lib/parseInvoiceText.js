// Heuristic invoice-text → candidate lines (acceptance Phase 3). PURE: plain regex/string work, NO model
// and NO tools — OCR/raw text is DATA, never instructions. Output is only ever used to PRE-FILL the review
// screen; every line is flagged `uncertain` and nothing is applied to stock or money without an explicit
// human review + commit. This is a convenience over manual entry, measured honestly against fixtures (see
// __tests__/extraction-quality.test.js) — we report observed results, never invented accuracy.
import { round2 } from './money';

// Lines that are clearly not product rows (totals, tax, headers, addresses, etc.).
const SKIP = /\b(invoice|statement|vat|tax|subtotal|sub-total|total|balance|amount due|account|customer|supplier|tel|phone|email|date|page|delivery note|order no|p\.?o\.?|thank you|terms|registered|company no|sort code)\b/i;
const MONEY = /£?\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})/g;      // 9.60, £12.00, 1,234.56
const LEADING_QTY = /^\s*(\d{1,4})\s*(?:x|×|\*|@)?\s+/i;              // "24 x ...", "2  ..."
const INLINE_QTY = /\b(\d{1,4})\s*(?:x|×)\s*/i;                       // "... 6 x ..."

function toNum(s) { return Number(String(s).replace(/[£,\s]/g, '')) || 0; }

/**
 * @param {string} text  raw OCR / pasted invoice text
 * @returns {{ lines:Array<{name,qty,qtyMode,unitCost,lineTotal,uncertain}>, meta:{rowsSeen,rowsParsed} }}
 */
export function parseInvoiceText(text) {
  const rows = String(text || '').split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const lines = [];
  let rowsSeen = 0;

  for (const row of rows) {
    if (SKIP.test(row)) continue;
    const monies = row.match(MONEY);
    if (!monies || !monies.length) continue; // a product row needs at least a price
    rowsSeen += 1;

    // The last money token on the row is almost always the line total.
    const lineTotal = toNum(monies[monies.length - 1]);
    if (lineTotal <= 0) continue;

    // Quantity: a leading count, or an inline "N x".
    let qty = 1;
    const lead = row.match(LEADING_QTY);
    const inline = row.match(INLINE_QTY);
    if (lead) qty = parseInt(lead[1], 10);
    else if (inline) qty = parseInt(inline[1], 10);
    if (!(qty > 0)) qty = 1;

    // Description = the row with the quantity marker, all money tokens and stray numbers stripped.
    let name = row
      .replace(LEADING_QTY, '')
      .replace(MONEY, '')
      .replace(/\b\d{1,4}\s*(?:x|×)\b/i, '')
      .replace(/[£]/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/[\s.,|-]+$/g, '')
      .trim();
    if (name.length < 2) continue; // no usable description → skip (don't invent one)

    // If the row looks like "qty × unitPrice ... lineTotal" we keep lineTotal and derive a best-guess unit
    // cost; otherwise unit cost = lineTotal / qty. Everything is flagged uncertain for the owner to check.
    const unitCost = qty > 0 ? round2(lineTotal / qty) : round2(lineTotal);
    lines.push({ name, qty, qtyMode: 'units', unitCost, lineTotal, uncertain: true });
  }

  return { lines, meta: { rowsSeen, rowsParsed: lines.length } };
}
