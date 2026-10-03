import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_WRITE_EVENT, STORAGE_ERROR_EVENT } from '../storage';
import { getSaveStatus, __resetSaveStatusForTest } from '../saveStatus';

// saveStatus wires its window listeners at module load; we exercise it by firing the same events storage.js
// emits on write success/failure.
function fire(type, detail) { window.dispatchEvent(new CustomEvent(type, { detail })); }

beforeEach(() => { __resetSaveStatusForTest(); });

describe('saveStatus — device save state (Phase 1.1)', () => {
  it('records a successful write and reports no failures', () => {
    fire(STORAGE_WRITE_EVENT, { name: 'inventory_v1' });
    const s = getSaveStatus();
    expect(s.lastWriteAt).toBeGreaterThan(0);
    expect(s.failed).toEqual([]);
  });

  it('surfaces a persistent failure until the SAME store saves again', () => {
    fire(STORAGE_ERROR_EVENT, { name: 'movements_v1', error: 'out of space' });
    expect(getSaveStatus().failed).toEqual([{ name: 'movements_v1', error: 'out of space' }]);

    // A different store saving does NOT clear the failing one.
    fire(STORAGE_WRITE_EVENT, { name: 'inventory_v1' });
    expect(getSaveStatus().failed.map((f) => f.name)).toEqual(['movements_v1']);

    // The failing store saving successfully clears it.
    fire(STORAGE_WRITE_EVENT, { name: 'movements_v1' });
    expect(getSaveStatus().failed).toEqual([]);
  });

  it('de-dupes repeated failures of the same store', () => {
    fire(STORAGE_ERROR_EVENT, { name: 'takings_v1', error: 'e1' });
    fire(STORAGE_ERROR_EVENT, { name: 'takings_v1', error: 'e2' });
    expect(getSaveStatus().failed).toEqual([{ name: 'takings_v1', error: 'e2' }]);
  });
});
