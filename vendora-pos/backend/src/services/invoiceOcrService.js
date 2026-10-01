'use strict';

// Optional invoice OCR (Phase 1). OFF unless a provider is configured in the environment. We never
// fabricate structured invoice data: when configured we return the extracted RAW TEXT only, which the PWA
// review screen shows to help the owner enter/correct fields. Structured parsing stays the user's job
// (nothing is silently applied). Secrets never leave the server; the client only sees `configured`.
const config = require('../config');

function isConfigured() {
  const o = config.invoiceOcr || {};
  if (o.provider === 'ocrspace') return !!o.ocrSpaceKey;
  return false;
}

/** Extract raw text from an invoice image via the configured provider. Returns { configured, text? }.
 *  Never throws for an unconfigured provider; never returns fabricated structured fields. */
async function extractText(dataUrl) {
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

module.exports = { isConfigured, extractText };
