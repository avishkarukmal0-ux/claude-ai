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

  it('F6 r2: a JPEG with EXIF/GPS is sanitised byte-wise even without a canvas', async () => {
    // Build a tiny JPEG: SOI, an APP1 (Exif) segment carrying a recognisable GPS payload, then SOS + EOI.
    const payload = Array.from('ExifSECRET-GPS-51.5,-0.1').map((c) => c.charCodeAt(0));
    const app1Len = payload.length + 2; // length field counts itself
    const bytes = [
      0xFF, 0xD8,                                   // SOI
      0xFF, 0xE1, (app1Len >> 8) & 0xFF, app1Len & 0xFF, ...payload, // APP1 (Exif/GPS)
      0xFF, 0xDA, 0x00, 0x02,                       // SOS (minimal)
      0x12, 0x34,                                   // "scan" bytes
      0xFF, 0xD9,                                   // EOI
    ];
    let bin = ''; for (const b of bytes) bin += String.fromCharCode(b);
    const src = `data:image/jpeg;base64,${btoa(bin)}`;

    const out = await downscaleImage(src, { maxDim: 800 }); // jsdom: no bitmap + no canvas → byte-wise fallback
    expect(out).toBeTruthy();
    expect(out).not.toBe(src);                        // it was changed (APP1 removed)
    const decoded = atob(out.split(',')[1]);
    expect(decoded).not.toContain('SECRET-GPS');      // the GPS payload is gone
    expect(decoded.charCodeAt(0)).toBe(0xFF);         // still a valid JPEG (SOI preserved)
    expect(decoded.charCodeAt(1)).toBe(0xD8);
  });

  it('F6 r2: a PNG (no EXIF here) is still returned unchanged', async () => {
    const src = 'data:image/png;base64,iVBORw0KGgo=';
    expect(await downscaleImage(src, { maxDim: 800 })).toBe(src);
  });
});
