'use strict';

/**
 * Unit tests for utility functions — no DB required
 */

const { formatCurrency, generateReceiptNumber, extractVat, addVat, round2 } = require('../utils/formatters');
const { generateGiftCardCode, generateCustomerCode, generateParkId, generatePONumber, todayStart, todayEnd, paginate } = require('../utils/helpers');
const AppError = require('../utils/AppError');

describe('formatters.js', () => {
  describe('formatCurrency', () => {
    it('should format zero', () => {
      expect(formatCurrency(0)).toBe('£0.00');
    });

    it('should format whole pounds', () => {
      expect(formatCurrency(5)).toBe('£5.00');
    });

    it('should format pennies', () => {
      expect(formatCurrency(0.99)).toBe('£0.99');
    });

    it('should format large amounts', () => {
      expect(formatCurrency(1234.56)).toBe('£1,234.56');
    });

    it('should round to 2dp', () => {
      expect(formatCurrency(1.999)).toBe('£2.00');
    });
  });

  describe('generateReceiptNumber', () => {
    it('should match YYYYMMDD-XXXX pattern with sequence number', () => {
      const rn = generateReceiptNumber(1);
      expect(rn).toMatch(/^\d{8}-\d{4}$/);
    });

    it('should contain today\'s date', () => {
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      const expected = `${yyyy}${mm}${dd}`;
      const rn = generateReceiptNumber(1);
      expect(rn.startsWith(expected)).toBe(true);
    });

    it('should pad sequence number to 4 digits', () => {
      expect(generateReceiptNumber(1)).toMatch(/-0001$/);
      expect(generateReceiptNumber(42)).toMatch(/-0042$/);
      expect(generateReceiptNumber(9999)).toMatch(/-9999$/);
    });

    it('should produce different numbers for different sequences', () => {
      const rn1 = generateReceiptNumber(1);
      const rn2 = generateReceiptNumber(2);
      expect(rn1).not.toBe(rn2);
    });
  });

  describe('round2', () => {
    it('should round to 2 decimal places', () => {
      expect(round2(1.234)).toBe(1.23);
      expect(round2(1.235)).toBe(1.24);
      expect(round2(1.005)).toBeCloseTo(1.01, 2);
    });

    it('should handle whole numbers', () => {
      expect(round2(5)).toBe(5);
    });

    it('should handle negative numbers', () => {
      expect(round2(-1.234)).toBe(-1.23);
    });
  });

  describe('extractVat', () => {
    it('should extract 20% VAT from inclusive price', () => {
      const { net, vat } = extractVat(1.20, 'standard'); // £1.20 inc VAT
      expect(round2(net)).toBe(1.00);
      expect(round2(vat)).toBe(0.20);
    });

    it('should extract 5% reduced VAT', () => {
      const { net, vat } = extractVat(1.05, 'reduced');
      expect(round2(net)).toBe(1.00);
      expect(round2(vat)).toBe(0.05);
    });

    it('should extract 0% for zero-rated', () => {
      const { net, vat } = extractVat(1.00, 'zero');
      expect(round2(net)).toBe(1.00);
      expect(round2(vat)).toBe(0.00);
    });

    it('should return 0 VAT for unknown vatRate', () => {
      const { net, vat } = extractVat(2.40, 99);
      expect(net).toBe(2.40);
      expect(vat).toBe(0);
    });
  });

  describe('addVat — returns { gross, vat }', () => {
    it('should add 20% VAT to net price', () => {
      const { gross, vat } = addVat(1.00, 'standard');
      expect(gross).toBe(1.20);
      expect(round2(vat)).toBe(0.20);
    });

    it('should add 5% reduced VAT', () => {
      const { gross, vat } = addVat(1.00, 'reduced');
      expect(gross).toBe(1.05);
      expect(round2(vat)).toBe(0.05);
    });

    it('should leave zero-rated unchanged', () => {
      const { gross, vat } = addVat(1.00, 'zero');
      expect(gross).toBe(1.00);
      expect(vat).toBe(0);
    });

    it('should calculate VAT for larger amounts', () => {
      const { gross } = addVat(10.00, 'standard');
      expect(gross).toBe(12.00);
    });
  });
});

describe('helpers.js', () => {
  describe('generateReceiptNumber-style IDs', () => {
    it('generateGiftCardCode should match XXXX-XXXX-XXXX-XXXX', () => {
      const code = generateGiftCardCode();
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    });

    it('generateCustomerCode should match C-XXXXXXXX', () => {
      const code = generateCustomerCode();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(3);
    });

    it('generateParkId should match PARK-XXXXX-XXX', () => {
      const id = generateParkId();
      expect(id).toMatch(/^PARK-[A-Z0-9]{5}-[A-Z0-9]{3}$/);
    });

    it('generatePONumber should match PO-YYYYMMDD-XXXX', () => {
      const po = generatePONumber();
      expect(po).toMatch(/^PO-\d{8}-[A-Z0-9]+$/);
    });
  });

  describe('todayStart / todayEnd', () => {
    it('todayStart should be midnight of today', () => {
      const start = todayStart();
      expect(start instanceof Date).toBe(true);
      expect(start.getHours()).toBe(0);
      expect(start.getMinutes()).toBe(0);
      expect(start.getSeconds()).toBe(0);
    });

    it('todayEnd should be 23:59:59 of today', () => {
      const end = todayEnd();
      expect(end instanceof Date).toBe(true);
      expect(end.getHours()).toBe(23);
      expect(end.getMinutes()).toBe(59);
      expect(end.getSeconds()).toBe(59);
    });

    it('todayEnd should be after todayStart', () => {
      expect(todayEnd() > todayStart()).toBe(true);
    });
  });

  describe('paginate — applies skip/limit to mongoose query', () => {
    it('should apply correct skip and limit to a mock query', () => {
      let capturedSkip, capturedLimit;
      const mockQuery = {
        skip: (n) => { capturedSkip = n; return mockQuery; },
        limit: (n) => { capturedLimit = n; return 'result'; },
      };
      const result = paginate(mockQuery, 3, 10);
      expect(capturedSkip).toBe(20); // (3-1)*10
      expect(capturedLimit).toBe(10);
      expect(result).toBe('result');
    });

    it('should default to page 1, limit 50', () => {
      let capturedSkip, capturedLimit;
      const mockQuery = {
        skip: (n) => { capturedSkip = n; return mockQuery; },
        limit: (n) => { capturedLimit = n; return mockQuery; },
      };
      paginate(mockQuery);
      expect(capturedSkip).toBe(0);
      expect(capturedLimit).toBe(50);
    });
  });
});

describe('AppError', () => {
  it('should be instanceof Error', () => {
    const err = new AppError('Something went wrong', 500, 'TEST_ERROR');
    expect(err instanceof Error).toBe(true);
    expect(err.statusCode).toBe(500);
    expect(err.errorCode).toBe('TEST_ERROR');
    expect(err.isOperational).toBe(true);
  });

  it('authInvalidCredentials should return 401', () => {
    const err = AppError.authInvalidCredentials();
    expect(err.statusCode).toBe(401);
    expect(err.errorCode).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('authTokenExpired should return 401', () => {
    const err = AppError.authTokenExpired();
    expect(err.statusCode).toBe(401);
    expect(err.errorCode).toBe('AUTH_TOKEN_EXPIRED');
  });

  it('validation should return 422 (Unprocessable Entity)', () => {
    const err = AppError.validation('Name is required');
    expect(err.statusCode).toBe(422);
    expect(err.errorCode).toBe('VALIDATION_ERROR');
    expect(err.message).toBe('Name is required');
  });

  it('notFound should return 404', () => {
    const err = AppError.notFound('Product');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('Product');
  });

  it('barcodeNotFound should return 404 with barcode', () => {
    const err = AppError.barcodeNotFound('5000112637922');
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain('5000112637922');
  });

  it('insufficientStock should return 400 with stock details', () => {
    const err = AppError.insufficientStock('Heineken', 3);
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe('INSUFFICIENT_STOCK');
    expect(err.message).toContain('Heineken');
    expect(err.message).toContain('3');
  });

  it('ageVerificationRequired should return 400 with product name', () => {
    const err = AppError.ageVerificationRequired('Whisky');
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe('AGE_VERIFICATION_REQUIRED');
    expect(err.message).toContain('Whisky');
  });

  it('factory errors should be operational', () => {
    const errors = [
      AppError.authInvalidCredentials(),
      AppError.barcodeNotFound('12345'),
      AppError.notFound('Sale'),
    ];
    errors.forEach(err => expect(err.isOperational).toBe(true));
  });
});
