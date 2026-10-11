// Async image downscaling (Phase 3.9h) — keep large image handling off the critical path. Invoice capture
// kept the full (≤8MB) photo as a base64 string in React state + localStorage, which janks the UI and
// risks quota; this shrinks it first. Uses createImageBitmap + OffscreenCanvas when available (decode off
// the main thread) and degrades gracefully: on any failure it returns the original input unchanged, so a
// browser without these APIs (or jsdom) still works.

// Strip EXIF/GPS/IPTC/comment marker segments from a JPEG data URL WITHOUT a canvas (audit F6, round 2). Phone
// photos are JPEG and carry GPS/device data in the APP1 (Exif) segment; when no canvas re-encode is available
// we still remove those bytes so location data never reaches a backup. Returns a sanitised JPEG data URL, or
// null if the input isn't a parseable JPEG (the caller then keeps the original — e.g. a PNG, which carries no
// such metadata here). Never throws.
function stripJpegMarkers(dataUrl) {
  try {
    if (typeof dataUrl !== 'string') return null;
    const m = /^data:image\/jpe?g;base64,(.*)$/i.exec(dataUrl);
    if (!m) return null;
    const bin = atob(m[1]);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = bin.charCodeAt(i);
    if (len < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null; // not a JPEG SOI
    const out = [0xFF, 0xD8];
    let pos = 2;
    let changed = false;
    while (pos + 1 < len) {
      if (bytes[pos] !== 0xFF) return null; // misaligned — bail rather than risk corrupting the image
      const marker = bytes[pos + 1];
      if (marker === 0xDA) { for (let i = pos; i < len; i += 1) out.push(bytes[i]); break; } // SOS → copy the rest as-is
      if (marker >= 0xD0 && marker <= 0xD9) { out.push(0xFF, marker); pos += 2; continue; } // standalone marker, no length
      if (pos + 3 >= len) return null;
      const segLen = (bytes[pos + 2] << 8) | bytes[pos + 3];
      if (segLen < 2 || pos + 2 + segLen > len) return null;
      const strip = marker === 0xE1 /* APP1/Exif(GPS) */ || marker === 0xED /* APP13/IPTC */
        || marker === 0xFE /* COM */ || (marker >= 0xE2 && marker <= 0xEF); /* APP2..APP15 */
      if (strip) changed = true;
      else for (let i = pos; i < pos + 2 + segLen; i += 1) out.push(bytes[i]);
      pos += 2 + segLen;
    }
    if (!changed) return dataUrl; // nothing sensitive present — return as-is
    let s = '';
    for (let i = 0; i < out.length; i += 1) s += String.fromCharCode(out[i]);
    return `data:image/jpeg;base64,${btoa(s)}`;
  } catch { return null; }
}

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
  // Last-resort fallback when NO canvas re-encode was possible: still strip JPEG EXIF/GPS byte-wise so we never
  // return metadata-bearing phone-photo bytes (audit F6 r2). Non-JPEGs (e.g. PNG) are returned unchanged.
  const fallback = async () => { const url = await asDataUrl(); return (url && stripJpegMarkers(url)) || url; };
  try {
    const bitmap = await toBitmap(src);
    // No modern bitmap decode → try the <img>+canvas fallback (still strips metadata) before degrading to the
    // byte-wise JPEG stripper, so a browser without createImageBitmap doesn't leak EXIF/GPS into backups (F6).
    if (!bitmap) { const viaImg = await downscaleViaImg(src, { maxDim, quality, type }); return viaImg || (await fallback()); }
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
    if (!ctx) { try { bitmap.close && bitmap.close(); } catch { /* ignore */ } return await fallback(); }
    ctx.drawImage(bitmap, 0, 0, w, h);
    try { bitmap.close && bitmap.close(); } catch { /* ignore */ }
    if (canvas.convertToBlob) { const blob = await canvas.convertToBlob({ type, quality }); return await blobToDataUrl(blob); }
    return canvas.toDataURL(type, quality);
  } catch {
    return await fallback();
  }
}
