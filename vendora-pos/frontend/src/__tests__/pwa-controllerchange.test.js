import { describe, it, expect } from 'vitest';
import { decideControllerChange } from '../pwa';

// Audit L-F1: an update ACCEPTED in a first-visit tab (whose controller first arrived this session) must still
// reload. The old code captured "had a controller" once and never updated it, so consent in such a tab warmed
// instead of reloading and the Refresh button did nothing.
describe('decideControllerChange (SW update lifecycle)', () => {
  it('first control, no consent → warm only, no reload', () => {
    expect(decideControllerChange({ controlled: false, consented: false })).toEqual({ reload: false, warm: true });
  });
  it('L-F1: consent in a first-visit tab (not yet controlled) → reload', () => {
    expect(decideControllerChange({ controlled: false, consented: true })).toEqual({ reload: true, warm: false });
  });
  it('consent in a controlled tab → reload', () => {
    expect(decideControllerChange({ controlled: true, consented: true })).toEqual({ reload: true, warm: false });
  });
  it('controlled, no consent (another tab accepted) → do nothing (protect this tab)', () => {
    expect(decideControllerChange({ controlled: true, consented: false })).toEqual({ reload: false, warm: false });
  });
});
