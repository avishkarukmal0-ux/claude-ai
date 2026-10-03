import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useDialog } from '../useDialog';

function Dialog({ active, onClose }) {
  const ref = useDialog(active, onClose);
  if (!active) return null;
  return (
    <div ref={ref} role="dialog" aria-label="Test">
      <button type="button">First</button>
      <button type="button">Last</button>
    </div>
  );
}

describe('useDialog — accessible modal behaviour (audit FE8)', () => {
  it('Escape calls onClose', () => {
    const onClose = vi.fn();
    render(<Dialog active onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the dialog on open', () => {
    render(<Dialog active onClose={() => {}} />);
    expect(document.activeElement?.textContent).toBe('First');
  });

  it('does nothing when inactive', () => {
    const onClose = vi.fn();
    render(<Dialog active={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Tab from the last focusable wraps to the first (focus trap)', () => {
    const { getByText } = render(<Dialog active onClose={() => {}} />);
    const last = getByText('Last');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement?.textContent).toBe('First');
  });
});
