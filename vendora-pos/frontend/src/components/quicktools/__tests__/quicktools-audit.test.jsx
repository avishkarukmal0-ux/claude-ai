import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import MarginCalculator from '../MarginCalculator';
import AgeCheckHelper from '../AgeCheckHelper';
import VpdCalculator from '../VpdCalculator';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const yearsAgoISO = (y) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - y);
  return d.toISOString().slice(0, 10);
};

describe('MarginCalculator — audit: negative money format + missing-sell hint', () => {
  it('prompts for a sell price when only cost is entered', () => {
    const { getByPlaceholderText, getByText } = render(<MarginCalculator />);
    fireEvent.change(getByPlaceholderText('e.g. 0.80'), { target: { value: '1.00' } });
    expect(getByText(/Enter a sell price/i)).toBeTruthy();
  });

  it('formats a below-cost loss as -£x.xx (sign outside the £), not £-x.xx', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<MarginCalculator />);
    fireEvent.change(getByPlaceholderText('e.g. 0.80'), { target: { value: '1.00' } }); // cost
    fireEvent.change(getByPlaceholderText('e.g. 1.20'), { target: { value: '0.80' } }); // sell < cost
    expect(getByText('-£0.20')).toBeTruthy();        // profit stat
    expect(queryByText('£-0.20')).toBeNull();         // never the ugly form
    expect(getByText(/losing £0.20 per unit/i)).toBeTruthy();
  });
});

describe('AgeCheckHelper — audit: never a negative age; bound the date in the handler', () => {
  it('rejects a future DOB as "Invalid date" and shows no age', () => {
    const { getByLabelText, getByText, queryByText } = render(<AgeCheckHelper />);
    fireEvent.change(getByLabelText(/Check a date of birth/i), { target: { value: '2999-01-01' } });
    expect(getByText(/Invalid date/i)).toBeTruthy();
    expect(queryByText(/years old/i)).toBeNull();     // no negative age leaks through
  });

  it('flags an implausible age (>110) as "Check this date"', () => {
    const { getByLabelText, getByText } = render(<AgeCheckHelper />);
    fireEvent.change(getByLabelText(/Check a date of birth/i), { target: { value: '1890-01-01' } });
    expect(getByText(/Check this date/i)).toBeTruthy();
  });

  it('passes a plainly-adult DOB and refuses an under-18', () => {
    const { getByLabelText, getByText, rerender } = render(<AgeCheckHelper />);
    fireEvent.change(getByLabelText(/Check a date of birth/i), { target: { value: yearsAgoISO(40) } });
    expect(getByText(/OK — 40 years old/i)).toBeTruthy();
    rerender(<AgeCheckHelper />);
    fireEvent.change(getByLabelText(/Check a date of birth/i), { target: { value: yearsAgoISO(15) } });
    expect(getByText(/Under age — 15 years old/i)).toBeTruthy();
  });
});

describe('VpdCalculator — audit: VAT-inclusive label + size hint + margin caveat', () => {
  it('labels the price field as incl. VAT and asks for the bottle size first', () => {
    const { getByText } = render(<VpdCalculator />);
    expect(getByText(/incl\. VAT/i)).toBeTruthy();
    expect(getByText(/Enter the bottle size/i)).toBeTruthy();
  });

  it('notes the suggested price excludes the shop margin', () => {
    const { getByPlaceholderText, getByText } = render(<VpdCalculator />);
    fireEvent.change(getByPlaceholderText('e.g. 10'), { target: { value: '10' } });
    fireEvent.change(getByPlaceholderText('e.g. 3.99'), { target: { value: '3.99' } });
    expect(getByText(/Suggested new price/i)).toBeTruthy();
    expect(getByText(/no margin added/i)).toBeTruthy();
  });
});
