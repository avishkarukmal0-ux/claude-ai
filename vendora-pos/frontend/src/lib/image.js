// Async image downscaling (Phase 3.9h) — keep large image handling off the critical path. Invoice capture
// kept the full (≤8MB) photo as a base64 string in React state + localStorage, which janks the UI and
// risks quota; this shrinks it first. Uses createImageBitmap + OffscreenCanvas when available (decode off
// the main thread) and degrades gracefully: on any failure it returns the original input unchanged, so a
// browser without these APIs (or jsdom) still works.

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(r.error || new Error('read-failed'));
    r.readAsDataURL(blob);
  });
}

async function toBitmap(src) {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    if (typeof src === 'string') {
      // data URL / blob URL → Blob → bitmap
      const res = await fetch(src);
      const blob = await res.blob();
      return await createImageBitmap(blob);
    }
    if (src instanceof Blob) return await createImageBitmap(src);
  } catch { /* fall through */ }
  return null;
}

/**
 * Downscale an image (a File/Blob or a data-URL string) to at most `maxDim` on its longest side and return
 * a smaller data URL. Returns the original input (as a data URL) if it's already small enough or if the
 * environment can't process it. Never throws.
 */
export async function downscaleImage(src, { maxDim = 1600, quality = 0.7, type = 'image/jpeg' } = {}) {
  const asDataUrl = async () => {
    if (typeof src === 'string') return src;
    if (src instanceof Blob) { try { return await blobToDataUrl(src); } catch { return null; } }
    return null;
  };
  try {
    const bitmap = await toBitmap(src);
    if (!bitmap) return await asDataUrl();
    const { width, height } = bitmap;
    const longest = Math.max(width, height) || 1;
    const scale = Math.min(1, maxDim / longest);
    // Audit FE5: ALWAYS re-encode through the canvas (even when the image already fits, scale===1) so EXIF/GPS
    // and other metadata are stripped. Returning the original source for small images leaked location/device
    // data into backups. Canvas pixels carry no metadata, so a scale-1 redraw sanitises without resizing.
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { try { bitmap.close && bitmap.close(); } catch { /* ignore */ } return await asDataUrl(); }
    ctx.drawImage(bitmap, 0, 0, w, h);
    try { bitmap.close && bitmap.close(); } catch { /* ignore */ }
    if (canvas.convertToBlob) { const blob = await canvas.convertToBlob({ type, quality }); return await blobToDataUrl(blob); }
    return canvas.toDataURL(type, quality);
  } catch {
    return await asDataUrl();
  }
}
