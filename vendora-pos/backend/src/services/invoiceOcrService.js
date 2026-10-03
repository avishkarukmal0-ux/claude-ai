'use strict';

// Optional invoice OCR (Phase 1). OFF unless a provider is configured in the environment. We never
// fabricate structured invoice data: when configured we return the extracted RAW TEXT only, which the PWA
// review screen shows to help the owner enter/correct fields. Structured parsing stays the user's job
// (nothing is silently applied). Secrets never leave the server; the client only sees `configured`.
//
// SECURITY (acceptance Phase 2): the uploaded image is UNTRUSTED input. We validate its declared type and
// size before doing anything with it. The provider (OCR.space) is a plain OCR engine, NOT an LLM — the
// returned text is DATA, never instructions, and it is never fed to a model, nor used to trigger any tool,
// message or financial action. The PWA shows the text for the owner to read; extracted data only ever
// affects stock or money after an explicit human review + commit (see invoiceStore.commitInvoice).
const config = require('../config');
const AppError = require('../utils/AppError');

// Accepted upload types + a hard size cap on the decoded image (defence against abuse / huge payloads).
const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|gif|heic|heif|bmp|tiff)|application\/pdf)$/i;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB decoded

/** Validate an untrusted base64 data URL. Throws AppError.validation (→ 422) on anything unexpected. */
function validateDataUrl(dataUrl) {
  const s = String(dataUrl || '');
  const m = /^data:([^;,]+)(;base64)?,(.*)$/is.exec(s);
  if (!m) throw AppError.validation('Expected a base64 data URL for the invoice image');
  const mime = m[1].trim();
  const isBase64 = !!m[2];
  const payload = m[3] || '';
  if (!ALLOWED_MIME.test(mime)) throw AppError.validation('Unsupported file type — upload a photo (JPG/PNG) or a PDF');
  if (!isBase64) throw AppError.validation('Invoice image must be base64-encoded');
  // Decoded size ≈ base64 length × 3/4 (minus padding). Reject oversize before sending anywhere.
  const bytes = Math.floor((payload.length * 3) / 4) - (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0);
  if (bytes <= 0) throw AppError.validation('The invoice image is empty');
  if (bytes > MAX_BYTES) throw AppError.validation('That file is too large — keep invoice photos under 8 MB');
  return { mime, bytes };
}

function isConfigured() {
  const o = config.invoiceOcr || {};
  if (o.provider === 'ocrspace') return !!o.ocrSpaceKey;
  return false;
}

/** Extract raw text from an invoice image via the configured provider. Returns { configured, text? }.
 *  Never throws for an unconfigured provider; never returns fabricated structured fields. */
async function extractText(dataUrl) {
  // Validate the untrusted upload FIRST — even when OCR is off, bad input is rejected rather than ignored.
  validateDataUrl(dataUrl);
  if (!isConfigured()) return { configured: false };
  const o = config.invoiceOcr;

  if (o.provider === 'ocrspace') {
    // OCR.space accepts a base64 image. Real call; runs from the deployed backend (public internet).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const body = new URLSearchParams();
      body.set('base64Image', String(dataUrl || ''));
      body.set('scale', 'true');
      body.set('OCREngine', '2');
      const res = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: { apikey: o.ocrSpaceKey, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
      if (!res.ok) return { configured: true, text: null, error: `OCR provider returned ${res.status}` };
      const json = await res.json();
      const text = (json && json.ParsedResults && json.ParsedResults[0] && json.ParsedResults[0].ParsedText) || '';
      return { configured: true, text: String(text || '') };
    } catch (e) {
      return { configured: true, text: null, error: 'OCR request failed or timed out' };
    } finally {
      clearTimeout(timer);
    }
  }

  return { configured: false };
}

module.exports = {
  isConfigured, extractText, validateDataUrl, ALLOWED_MIME, MAX_BYTES,
};
