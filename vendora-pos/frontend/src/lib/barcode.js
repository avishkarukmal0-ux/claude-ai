// Barcode validation — one source of truth so Stock, Scan-to-identify and delivery booking agree.
// A real retail barcode (EAN-8/UPC-A/EAN-13/ITF-14) is 8–14 digits.

/** Optional-aware: empty is allowed (the field is optional), but a present code must be 8–14 digits. */
export function validBarcode(code) {
  const v = String(code || '').trim();
  return v === '' || /^\d{8,14}$/.test(v);
}

/** Strict: a real barcode is present AND 8–14 digits (use when a code is required, e.g. a manual lookup). */
export function isBarcode(code) {
  return /^\d{8,14}$/.test(String(code || '').trim());
}
