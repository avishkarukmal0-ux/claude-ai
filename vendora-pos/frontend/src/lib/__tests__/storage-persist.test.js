import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestPersistentStorage } from '../storage';

const origStorage = navigator.storage;
afterEach(() => {
  try { Object.defineProperty(navigator, 'storage', { value: origStorage, configurable: true }); } catch { /* ignore */ }
  vi.restoreAllMocks();
});

function stubStorage(impl) {
  Object.defineProperty(navigator, 'storage', { value: impl, configurable: true });
}

describe('requestPersistentStorage — keep on-device data from being evicted', () => {
  it('returns unsupported (no throw) when the API is absent', async () => {
    stubStorage(undefined);
    await expect(requestPersistentStorage()).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });

  it('does not re-request when persistence is already granted', async () => {
    const persist = vi.fn();
    stubStorage({ persisted: () => Promise.resolve(true), persist });
    await expect(requestPersistentStorage()).resolves.toEqual({ ok: true, already: true });
    expect(persist).not.toHaveBeenCalled(); // already persisted → don't prompt again
  });

  it('requests persistence when not yet granted and reports the outcome', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    stubStorage({ persisted: () => Promise.resolve(false), persist });
    await expect(requestPersistentStorage()).resolves.toEqual({ ok: true });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('swallows a throwing implementation', async () => {
    stubStorage({ persisted: () => { throw new Error('nope'); }, persist: () => {} });
    await expect(requestPersistentStorage()).resolves.toEqual({ ok: false, reason: 'error' });
  });
});
