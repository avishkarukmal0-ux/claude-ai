import { describe, it, expect } from 'vitest';
import { parseInvoiceText } from '../parseInvoiceText';
import cashCarry from './fixtures/invoices/cash-carry.txt?raw';
import itemised from './fixtures/invoices/itemised.txt?raw';
import messy from './fixtures/invoices/messy-ocr.txt?raw';

// Extraction-quality harness (acceptance Phase 3). Runs the pure heuristic parser over anonymised,
// representative invoice-text fixtures and REPORTS OBSERVED results — it does not invent accuracy figures.
// Assertions are soft invariants (never throws, never invents rows, finds the obvious lines) so the suite
// stays stable; the console output is the measured record for the acceptance report.
const FIXTURES = [
  // expectedProducts = hand-labelled count of real product rows; mustFind = substrings that should appear.
  { name: 'cash-carry', text: cashCarry, expectedProducts: 4, mustFind: [/cola/i, /walkers/i, /red bull/i, /pepsi/i] },
  { name: 'itemised', text: itemised, expectedProducts: 3, mustFind: [/milk/i, /bread/i, /egg/i] },
  { name: 'messy-ocr', text: messy, expectedProducts: 3, mustFind: [/su.?6?ar|sugar/i, /tea/i, /marl/i] },
];

describe('parseInvoiceText — extraction quality (observed, not invented)', () => {
  const report = [];

  for (const fx of FIXTURES) {
    it(`${fx.name}: parses product rows without inventing data`, () => {
      const { lines, meta } = parseInvoiceText(fx.text);
      const totalRows = fx.text.split(/\r?\n/).filter((r) => r.trim()).length;

      // Soft invariants (stable):
      expect(Array.isArray(lines)).toBe(true);
      expect(meta.rowsParsed).toBe(lines.length);
      expect(lines.length).toBeGreaterThanOrEqual(1);          // finds something
      expect(lines.length).toBeLessThanOrEqual(totalRows);     // never more lines than text rows (no invention)
      for (const l of lines) {
        expect(l.uncertain).toBe(true);                        // every pre-filled line is flagged for review
        expect(typeof l.name).toBe('string');
        expect(l.name.length).toBeGreaterThan(1);
        expect(Number.isFinite(l.lineTotal)).toBe(true);
      }
      const found = fx.mustFind.filter((re) => lines.some((l) => re.test(l.name))).length;

      report.push({ fixture: fx.name, expected: fx.expectedProducts, detected: lines.length, mustFindHit: `${found}/${fx.mustFind.length}` });
      // At least half of the obvious items are detected (heuristic, not perfect).
      expect(found).toBeGreaterThanOrEqual(Math.ceil(fx.mustFind.length / 2));
    });
  }

  it('reports observed extraction results (no invented accuracy %)', () => {
    // eslint-disable-next-line no-console
    console.log('\n[extraction-quality] observed results (heuristic pre-fill, human review required):');
    for (const r of report) {
      // eslint-disable-next-line no-console
      console.log(`  ${r.fixture}: expected ${r.expected} product rows, detected ${r.detected}, key items ${r.mustFindHit}`);
    }
    expect(report.length).toBe(FIXTURES.length);
  });
});
