// Vitest setup — clean localStorage between tests so scoped-storage tests don't bleed.
import { afterEach, beforeEach } from 'vitest';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
});
