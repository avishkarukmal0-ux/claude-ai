import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resolveImage, saveImage, removeImage, restoreImage, getThumbLocal, confirmSuggested,
  __setDownscale, __setImageTransport,
} from '../productImages';
import { setActiveWorkspace, LOCAL_WORKSPACE, __resetMemForTest } from '../storage';

const DATA = 'data:image/jpeg;base64,/9j/AAA=';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace(LOCAL_WORKSPACE);
  __setDownscale(async (src) => (typeof src === 'string' ? src : DATA)); // identity compressor for tests
  // fetch stub: data-URL → Blob (for dataUrlToBlob), and the suggested-image proxy → a blob.
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }) }));
});
afterEach(() => { __setDownscale(null); __setImageTransport(null); vi.restoreAllMocks(); });

describe('productImages — selection order', () => {
  it('owner saved photo wins', () => {
    const r = resolveImage({ image: { id: 'pi_1', source: 'owner' } }, { image: 'http://x/y.jpg' });
    expect(r.state).toBe('owner');
    expect(r.id).toBe('pi_1');
  });
  it('catalogue image when source is catalogue', () => {
    const r = resolveImage({ image: { id: 'pi_2', source: 'catalogue', attribution: 'OFF' } }, null);
    expect(r.state).toBe('catalogue');
    expect(r.attribution).toBe('OFF');
  });
  it('provider suggestion when no saved image', () => {
    const r = resolveImage({}, { image: 'https://img/x.jpg', imageLarge: 'https://img/xl.jpg', imageAttribution: 'Photo: OFF' });
    expect(r.state).toBe('suggested');
    expect(r.confirmed).toBe(false);
    expect(r.attribution).toBe('Photo: OFF');
  });
  it('placeholder when nothing available', () => {
    expect(resolveImage({}, null).state).toBe('placeholder');
  });
  it('a soft-deleted image falls back (not shown as owner)', () => {
    const r = resolveImage({ image: { id: 'pi_3', source: 'owner', deleted: true } }, null);
    expect(r.state).toBe('placeholder');
  });
});

describe('productImages — save / recoverable delete', () => {
  it('saves an owner image locally (full + thumb) and reads the thumb back', async () => {
    const saved = await saveImage(DATA, { source: 'owner' });
    expect(saved.ok).toBe(true);
    expect(getThumbLocal(saved.id)).toBeTruthy();
  });

  it('remove is recoverable; restore brings it back', async () => {
    const saved = await saveImage(DATA, { source: 'owner' });
    const del = removeImage(saved.id);
    expect(del.recoverable).toBe(true);
    expect(getThumbLocal(saved.id)).toBe(null);
    const res = restoreImage(saved.id);
    expect(res.ok).toBe(true);
    expect(getThumbLocal(saved.id)).toBeTruthy();
  });
});

describe('productImages — confirm a provider suggestion', () => {
  it('downloads, stores as a catalogue image with attribution, and returns a ref', async () => {
    __setImageTransport({ status: async () => ({ enabled: false }), upload: async () => ({}), download: async () => null });
    const ref = await confirmSuggested(
      { image: 'https://images.openfoodfacts.org/x.jpg', imageLarge: 'https://images.openfoodfacts.org/xl.jpg', imageAttribution: 'Photo: Open Food Facts contributors (CC BY-SA 3.0)' },
      { barcode: '5000000000000' },
    );
    expect(ref).toBeTruthy();
    expect(ref.source).toBe('catalogue');
    expect(ref.attribution).toMatch(/Open Food Facts/);
    expect(getThumbLocal(ref.id)).toBeTruthy(); // stored locally
  });

  it('returns null when nothing to confirm', async () => {
    expect(await confirmSuggested(null)).toBe(null);
    expect(await confirmSuggested({})).toBe(null);
  });
});
