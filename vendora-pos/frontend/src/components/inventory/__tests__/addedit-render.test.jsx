import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, within } from '@testing-library/react';
import InventoryView from '../InventoryView';
import { setActiveWorkspace, __resetMemForTest, writeJSON } from '../../../lib/storage';

// Regression (v31 hotfix): Add product and Edit product crashed with
// "ReferenceError: validBarcode is not defined" because the module re-exported the
// helper without importing it into local scope. Opening both forms must render clean.
beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace('shop:addedit');
  writeJSON('inventory_v1', [{
    id: 'p1', name: 'Test Cola', barcode: '5012345678900', category: 'Soft drinks',
    qty: 10, min: 4, cost: 0.4, price: 0.9, packSize: 1, batches: [], extraBarcodes: [],
  }]);
});
afterEach(cleanup);

describe('Stock — Add/Edit forms render without crashing (validBarcode in scope)', () => {
  it('opens the Add form', () => {
    const { getByText } = render(<InventoryView />);
    fireEvent.click(getByText('Add')); // toggles the Add form
    expect(getByText('Save item')).toBeTruthy(); // AddForm's submit button — the form calls validBarcode
  });

  it('opens the Edit form from the row kebab', () => {
    const { getByLabelText, getByText } = render(<InventoryView />);
    fireEvent.click(getByLabelText('More actions for Test Cola')); // open kebab
    fireEvent.click(getByText('Edit product'));                    // EditForm calls validBarcode
    expect(getByText('Edit product')).toBeTruthy();                // heading of the open EditForm
  });
});
