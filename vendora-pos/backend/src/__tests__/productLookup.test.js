'use strict';

// Pure unit tests for the barcode-lookup mapper — no network, no DB.
const { mapOffProduct, labelFromTag } = require('../services/productLookupService');

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
      found: true, name: 'Dairy Milk 110g', category: 'Chocolates', brand: 'Cadbury', source: 'openfoodfacts',
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
});
