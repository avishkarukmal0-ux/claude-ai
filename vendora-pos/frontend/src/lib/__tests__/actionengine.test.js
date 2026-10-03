import { describe, it, expect } from 'vitest';
import { buildActions } from '../actionEngine';

// Pure derivation — no storage. Focus on the Phase 2.5 gap: unfinished (draft) deliveries surfaced as an
// action, plus a couple of guards so the signal is useful, not noisy.
describe('actionEngine — unfinished deliveries (Phase 2.5)', () => {
  it('surfaces a draft delivery that has lines, linking to the receive screen', () => {
    const actions = buildActions({
      deliveries: [{ id: 'd1', status: 'draft', supplierName: 'Bestway', lines: [{ qty: 3 }] }],
      now: new Date('2026-10-02T09:00:00Z'),
    });
    const a = actions.find((x) => x.id === 'delivery-draft');
    expect(a).toBeTruthy();
    expect(a.go).toEqual({ screen: 'receive' });
    expect(a.severity).toBe('warn');
    expect(a.detail).toMatch(/Bestway/);
  });

  it('ignores an empty draft (no lines) and a received delivery', () => {
    const actions = buildActions({
      deliveries: [
        { id: 'd1', status: 'draft', lines: [] },               // empty draft — not real work yet
        { id: 'd2', status: 'received', lines: [{ qty: 1 }] },   // already booked in
      ],
      now: new Date('2026-10-02T09:00:00Z'),
    });
    expect(actions.find((x) => x.id === 'delivery-draft')).toBeUndefined();
  });

  it('counts multiple open drafts in the title', () => {
    const actions = buildActions({
      deliveries: [
        { id: 'd1', status: 'draft', lines: [{ qty: 1 }] },
        { id: 'd2', status: 'draft', lines: [{ qty: 2 }] },
      ],
      now: new Date('2026-10-02T09:00:00Z'),
    });
    const a = actions.find((x) => x.id === 'delivery-draft');
    expect(a.title).toMatch(/2 deliveries/);
  });
});
