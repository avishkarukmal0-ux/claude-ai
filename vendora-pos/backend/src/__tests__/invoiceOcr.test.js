'use strict';

// Pure, DB-free tests for untrusted invoice-upload validation + OCR safety (acceptance Phase 2).
const ocr = require('../services/invoiceOcrService');

const b64 = (bytes) => 'A'.repeat(Math.ceil(bytes * 4 / 3)); // ~bytes of base64 payload
const img = (payload = 'AAAA') => `data:image/png;base64,${payload}`;

describe('invoiceOcrService.validateDataUrl — untrusted upload', () => {
  test('accepts a small base64 image and reports type + size', () => {
    const r = ocr.validateDataUrl(img('AAAA'));
    expect(r.mime).toBe('image/png');
    expect(r.bytes).toBeGreaterThan(0);
  });

  test('accepts a PDF', () => {
    expect(ocr.validateDataUrl('data:application/pdf;base64,AAAA').mime).toBe('application/pdf');
  });

  test('rejects a non-image/pdf type', () => {
    expect(() => ocr.validateDataUrl('data:text/html;base64,PHNjcmlwdD4=')).toThrow(/Unsupported file type/i);
    expect(() => ocr.validateDataUrl('data:application/javascript;base64,YWxlcnQoMSk=')).toThrow();
  });

  test('rejects a non-data-URL / non-base64 payload', () => {
    expect(() => ocr.validateDataUrl('not a data url')).toThrow();
    expect(() => ocr.validateDataUrl('data:image/png,rawtext')).toThrow(/base64/i);
    expect(() => ocr.validateDataUrl('')).toThrow();
  });

  test('rejects oversize payloads', () => {
    const tooBig = img(b64(ocr.MAX_BYTES + 1024));
    expect(() => ocr.validateDataUrl(tooBig)).toThrow(/too large/i);
  });

  test('rejects an empty image', () => {
    expect(() => ocr.validateDataUrl('data:image/png;base64,')).toThrow();
  });
});

describe('invoiceOcrService.extractText — validation before anything else', () => {
  test('throws on invalid input even when OCR is unconfigured', async () => {
    await expect(ocr.extractText('data:text/plain;base64,aGVsbG8=')).rejects.toThrow();
  });

  test('returns configured:false (no fabricated fields) for a valid image when no provider is set', async () => {
    // In the test env no provider is configured → never calls out, never invents structured data.
    const r = await ocr.extractText(img('AAAA'));
    expect(r).toEqual({ configured: false });
  });
});
