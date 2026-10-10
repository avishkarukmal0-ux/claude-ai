import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BreakdownFigure } from '../NeighbourhoodAreaCard';

// The 18 TS007A five-year bands, in correct age order (the expected render order for the age card).
const AGE_ORDER = [
  'Aged 4 years and under', 'Aged 5 to 9 years', 'Aged 10 to 14 years', 'Aged 15 to 19 years',
  'Aged 20 to 24 years', 'Aged 25 to 29 years', 'Aged 30 to 34 years', 'Aged 35 to 39 years',
  'Aged 40 to 44 years', 'Aged 45 to 49 years', 'Aged 50 to 54 years', 'Aged 55 to 59 years',
  'Aged 60 to 64 years', 'Aged 65 to 69 years', 'Aged 70 to 74 years', 'Aged 75 to 79 years',
  'Aged 80 to 84 years', 'Aged 85 years and over',
];

const labelsInOrder = (container) =>
  [...container.querySelectorAll('ul li span.truncate')].map((el) => el.textContent);

describe('BreakdownFigure — age ordering (2026-10-10)', () => {
  it('renders all 18 age bands in age order (4-and-under first, 85+ last), no toggle', () => {
    // Shuffle the bands and give them arbitrary values so a value-sort would NOT produce age order.
    const shuffled = [...AGE_ORDER]
      .map((label, i) => ({ label, value: ((i * 7) % 18) + 1, pct: 1 }))
      .sort(() => 0.5 - Math.random());
    const { container, queryByText } = render(<BreakdownFigure f={{ key: 'age', label: 'Age', rows: shuffled }} />);
    const shown = labelsInOrder(container);
    expect(shown).toEqual(AGE_ORDER);        // age order, not value order
    expect(shown).toHaveLength(18);          // all bands shown (no 8-row cap)
    expect(shown[0]).toBe('Aged 4 years and under');
    expect(shown[shown.length - 1]).toBe('Aged 85 years and over');
    expect(queryByText(/Show all/i)).toBeNull(); // no toggle for age
  });

  it('does not mutate f.rows when ordering the age card', () => {
    const rows = [
      { label: 'Aged 85 years and over', value: 5, pct: 1 },
      { label: 'Aged 4 years and under', value: 9, pct: 1 },
    ];
    const snapshot = rows.map((r) => r.label);
    render(<BreakdownFigure f={{ key: 'age', label: 'Age', rows }} />);
    expect(rows.map((r) => r.label)).toEqual(snapshot); // original array untouched
  });

  it('falls back to given order (no throw) if an age label has no parseable number', () => {
    const rows = [
      { label: 'Unknown', value: 3, pct: 1 },
      { label: 'Aged 5 to 9 years', value: 7, pct: 1 },
    ];
    const { container } = render(<BreakdownFigure f={{ key: 'age', label: 'Age', rows }} />);
    expect(labelsInOrder(container)).toEqual(['Unknown', 'Aged 5 to 9 years']); // as given, both shown
  });
});

describe('BreakdownFigure — non-age breakdowns unchanged', () => {
  it('a value-sorted breakdown with >8 rows still caps at 8 with a "Show all N" toggle', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ label: `Cat ${i + 1}`, value: 10 - i, pct: 1 }));
    const { container, getByText } = render(<BreakdownFigure f={{ key: 'qualifications', label: 'Qualifications', rows }} />);
    expect(labelsInOrder(container)).toHaveLength(8);   // capped
    expect(getByText('Show all 10')).toBeTruthy();      // toggle present
  });

  it('a breakdown with <=8 rows shows all and no toggle', () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({ label: `Q${i + 1}`, value: 7 - i, pct: 1 }));
    const { container, queryByText } = render(<BreakdownFigure f={{ key: 'qualifications', label: 'Qualifications', rows }} />);
    expect(labelsInOrder(container)).toHaveLength(7);
    expect(queryByText(/Show all/i)).toBeNull();
  });
});
