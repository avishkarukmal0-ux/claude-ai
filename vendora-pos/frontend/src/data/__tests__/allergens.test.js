import { describe, it, expect } from 'vitest';
import { detectAllergens, emphasiseIngredients } from '../allergens';

describe('detectAllergens — likely allergens from ingredients text (PPDS)', () => {
  it('maps ingredient words to allergens (wheat → gluten, egg/milk)', () => {
    const found = detectAllergens('Wheat flour, chicken, mayonnaise (egg), butter');
    expect(found).toEqual(expect.arrayContaining(['Cereals containing gluten', 'Eggs', 'Milk']));
  });
  it('respects word boundaries (does not match "oat" inside "coat")', () => {
    expect(detectAllergens('coat hanger')).not.toContain('Cereals containing gluten');
    expect(detectAllergens('oats, water')).toContain('Cereals containing gluten');
  });
  it('returns nothing for an allergen-free list', () => {
    expect(detectAllergens('water, sugar, salt')).toEqual([]);
  });
});

describe('emphasiseIngredients — marks allergen keywords for emphasis', () => {
  it('flags the matched segments and preserves the rest', () => {
    const segs = emphasiseIngredients('Wheat flour, sugar, milk');
    expect(segs.filter((s) => s.hit).map((s) => s.text.toLowerCase())).toEqual(expect.arrayContaining(['wheat', 'milk']));
    expect(segs.map((s) => s.text).join('')).toBe('Wheat flour, sugar, milk'); // lossless
  });
});
