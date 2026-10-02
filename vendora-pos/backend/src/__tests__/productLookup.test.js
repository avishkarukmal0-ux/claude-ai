'use strict';

// Pure unit tests for the barcode-lookup mapper — no network, no DB.
const { mapOffProduct, labelFromTag, isAllowedImageUrl } = require('../services/productLookupService');

describe('productLookupService.labelFromTag', () => {
  test('strips the language prefix and humanises the tag', () => {
    expect(labelFromTag('en:sweet-snacks')).toBe('Sweet snacks');
    expect(labelFromTag('fr:boissons')).toBe('Boissons');
    expect(labelFromTag('chocolates')).toBe('Chocolates');
  });
  test('blank-safe', () => {
    expect(labelFromTag('')).toBeNull();
    expect(labelFromTag(null)).toBeNull();
  });
});

describe('productLookupService.mapOffProduct', () => {
  test('maps a found product to name + most-specific category + brand', () => {
    const json = {
      status: 1,
      product: {
        product_name: 'Dairy Milk 110g',
        brands: 'Cadbury, Mondelez',
        categories_tags: ['en:snacks', 'en:sweet-snacks', 'en:chocolates'],
      },
    };
    expect(mapOffProduct(json)).toEqual({
      found: true, name: 'Dairy Milk 110g', category: 'Chocolates', brand: 'Cadbury', size: null, source: 'openfoodfacts',
    });
  });

  test('status 0 (not found) → { found:false }', () => {
    expect(mapOffProduct({ status: 0, product: {} })).toEqual({ found: false });
    expect(mapOffProduct(null)).toEqual({ found: false });
  });

  test('a product with neither name nor category is treated as not found', () => {
    expect(mapOffProduct({ status: 1, product: { product_name: '', categories_tags: [] } })).toEqual({ found: false });
  });

  test('name present but no categories → found with null category', () => {
    const out = mapOffProduct({ status: 1, product: { product_name: 'Mystery Item' } });
    expect(out).toMatchObject({ found: true, name: 'Mystery Item', category: null });
  });

  test('maps pack size + a suggested image with licence/attribution (https only)', () => {
    const out = mapOffProduct({ status: 1, product: {
      product_name: 'Cola', quantity: '330 ml',
      image_front_small_url: 'https://images.openfoodfacts.org/x.small.jpg',
      image_front_url: 'https://images.openfoodfacts.org/x.jpg',
    } });
    expect(out.size).toBe('330 ml');
    expect(out.image).toBe('https://images.openfoodfacts.org/x.small.jpg');
    expect(out.imageLarge).toBe('https://images.openfoodfacts.org/x.jpg');
    expect(out.imageSource).toBe('openfoodfacts');
    expect(out.imageLicence).toMatch(/CC BY-SA/);
    expect(out.imageAttribution).toMatch(/Open Food Facts/);
  });

  test('ignores non-https image URLs', () => {
    const out = mapOffProduct({ status: 1, product: { product_name: 'Cola', image_front_url: 'http://insecure/x.jpg' } });
    expect(out.image).toBeUndefined();
  });

  test('found when ONLY an image is available (no name/category)', () => {
    const out = mapOffProduct({ status: 1, product: { image_front_url: 'https://images.openfoodfacts.org/x.jpg' } });
    expect(out.found).toBe(true);
    expect(out.image).toBe('https://images.openfoodfacts.org/x.jpg');
  });
});

describe('productLookupService.isAllowedImageUrl (SSRF guard)', () => {
  test('allows https Open Food Facts image hosts only', () => {
    expect(isAllowedImageUrl('https://images.openfoodfacts.org/x.jpg')).toBe(true);
    expect(isAllowedImageUrl('https://static.openfoodfacts.org/x.jpg')).toBe(true);
  });
  test('rejects other hosts, http, and junk', () => {
    expect(isAllowedImageUrl('https://evil.example.com/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('http://images.openfoodfacts.org/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('not a url')).toBe(false);
    expect(isAllowedImageUrl('')).toBe(false);
  });
});
