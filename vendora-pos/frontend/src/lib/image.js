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

// Fallback decode via HTMLImageElement + 2D canvas (audit F6): used when createImageBitmap/OffscreenCanvas aren't
// available. Re-encoding through a canvas STRIPS EXIF/GPS/device metadata too, so a browser without the modern
// APIs doesn't fall back to returning the ORIGINAL (metadata-bearing) bytes. Returns a sanitised data URL, or null
// if it can't decode (e.g. jsdom — the caller then degrades to the original, which in tests carries no real EXIF).
async function downscaleViaImg(src, { maxDim, quality, type }) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null;
  // Bail early if 2D canvas isn't usable (e.g. jsdom returns null) — both so we never re-encode without a canvas
  // AND so we don't await an <img> that will never fire load/error in that environment.
  let probeCtx = null;
  try { probeCtx = document.createElement('canvas').getContext('2d'); } catch { probeCtx = null; }
  if (!probeCtx) return null;
  let url = null; let revoke = false;
  try {
    if (typeof src === 'string') url = src;
    else if (src instanceof Blob && typeof URL !== 'undefined' && URL.createObjectURL) { url = URL.createObjectURL(src); revoke = true; }
    else return null;
    const img = await new Promise((resolve) => {
      const i = new Image();
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      i.onload = () => finish(i);
      i.onerror = () => finish(null);
      try { i.src = url; } catch { finish(null); }
      setTimeout(() => finish(null), 3000); // never hang if the environment doesn't fire load/error
    });
    if (!img || !img.width || !img.height) return null;
    const longest = Math.max(img.width, img.height) || 1;
    const scale = Math.min(1, maxDim / longest);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL(type, quality);
  } catch { return null; }
  finally { if (revoke && url) { try { URL.revokeObjectURL(url); } catch { /* ignore */ } } }
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
    // No modern bitmap decode → try the <img>+canvas fallback (still strips metadata) before degrading to the
    // original bytes, so a browser without createImageBitmap doesn't leak EXIF/GPS into backups (audit F6).
    if (!bitmap) { const viaImg = await downscaleViaImg(src, { maxDim, quality, type }); return viaImg || (await asDataUrl()); }
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
