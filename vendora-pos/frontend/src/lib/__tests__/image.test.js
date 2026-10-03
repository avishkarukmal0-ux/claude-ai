import { describe, it, expect } from 'vitest';
import { downscaleImage } from '../image';

// jsdom has no createImageBitmap / canvas 2d context, so downscaleImage must degrade gracefully and return
// the input unchanged rather than throwing — that fallback is the contract the callers rely on.
describe('image.downscaleImage (Phase 3.9h) — graceful degradation', () => {
  it('returns the original data URL when the environment cannot process it', async () => {
    const src = 'data:image/png;base64,iVBORw0KGgo=';
    const out = await downscaleImage(src, { maxDim: 800 });
    expect(out).toBe(src);
  });

  it('never throws on odd input', async () => {
    await expect(downscaleImage('not-a-real-image')).resolves.toBeDefined();
  });
});
