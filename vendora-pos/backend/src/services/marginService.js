'use strict';

const MarginSettings = require('../models/MarginSettings');

// UK c-store default margin targets per category
const UK_DEFAULTS = [
  { name: 'Beer',              targetMargin: 35, minMargin: 20, maxMargin: 60, vatRate: 20 },
  { name: 'Cider',             targetMargin: 35, minMargin: 20, maxMargin: 60, vatRate: 20 },
  { name: 'Beer & Cider',      targetMargin: 35, minMargin: 20, maxMargin: 60, vatRate: 20 },
  { name: 'Spirits',           targetMargin: 30, minMargin: 20, maxMargin: 50, vatRate: 20 },
  { name: 'Wine',              targetMargin: 35, minMargin: 22, maxMargin: 55, vatRate: 20 },
  { name: 'Soft Drinks',       targetMargin: 45, minMargin: 30, maxMargin: 70, vatRate: 20 },
  { name: 'Snacks',            targetMargin: 45, minMargin: 30, maxMargin: 70, vatRate: 20 },
  { name: 'Confectionery',     targetMargin: 40, minMargin: 25, maxMargin: 65, vatRate: 20 },
  { name: 'Tobacco',           targetMargin: 12, minMargin:  8, maxMargin: 20, vatRate: 20 },
  { name: 'Lottery',           targetMargin:  0, minMargin:  0, maxMargin:  0, vatRate:  0 },
  { name: 'Mobile Top-Up',     targetMargin:  0, minMargin:  0, maxMargin:  2, vatRate:  0 },
  { name: 'Top-Up',            targetMargin:  0, minMargin:  0, maxMargin:  2, vatRate:  0 },
  { name: 'Top-Up Cards',      targetMargin:  0, minMargin:  0, maxMargin:  2, vatRate:  0 },
  { name: 'Newspapers',        targetMargin: 25, minMargin: 15, maxMargin: 40, vatRate:  0 },
  { name: 'Newspapers & Mags', targetMargin: 25, minMargin: 15, maxMargin: 40, vatRate:  0 },
  { name: 'Frozen',            targetMargin: 35, minMargin: 22, maxMargin: 55, vatRate: 20 },
  { name: 'Chilled',           targetMargin: 35, minMargin: 22, maxMargin: 55, vatRate: 20 },
  { name: 'Household',         targetMargin: 40, minMargin: 25, maxMargin: 60, vatRate: 20 },
  { name: 'Health',            targetMargin: 45, minMargin: 30, maxMargin: 65, vatRate: 20 },
  { name: 'Health/Beauty',     targetMargin: 45, minMargin: 30, maxMargin: 65, vatRate: 20 },
];

/**
 * Get or create margin settings for a store.
 * Auto-seeds UK defaults on first access.
 */
async function getOrCreate(storeId) {
  let settings = await MarginSettings.findOne({ store: storeId }).lean();
  if (!settings) {
    settings = await MarginSettings.create({
      store: storeId,
      defaultMargin: 30,
      categories: UK_DEFAULTS,
    });
    settings = settings.toObject();
  }
  return settings;
}

/**
 * Find the best-matching category rule for a given category name.
 * Falls back to defaultMargin.
 */
function getRule(settings, category) {
  if (!category) {
    return { targetMargin: settings.defaultMargin, minMargin: Math.round(settings.defaultMargin * 0.6), maxMargin: 0, vatRate: 20 };
  }
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cats = settings.categories || [];
  // Exact match first
  let match = cats.find(c => norm(c.name) === norm(category));
  if (!match) {
    // Partial: category contains rule name or vice versa
    match = cats.find(c => norm(category).includes(norm(c.name)) || norm(c.name).includes(norm(category)));
  }
  if (!match) {
    return { name: 'Default', targetMargin: settings.defaultMargin, minMargin: Math.round(settings.defaultMargin * 0.6), maxMargin: 0, vatRate: 20 };
  }
  return match;
}

/**
 * Resolve the effective margin rule for a specific product:
 * product override → category rule → store default.
 * A numeric `product.pricing.targetMargin` overrides just the target (min/max/
 * vat still come from the category so alerts stay sensible); min is nudged down
 * if the override would otherwise sit below it.
 */
function getRuleForProduct(settings, product) {
  const base = getRule(settings, product?.category || '');
  const override = product?.pricing?.targetMargin;
  if (override === null || override === undefined || override === '') return { ...base, source: base.name ? 'category' : 'default' };
  const targetMargin = Number(override);
  if (Number.isNaN(targetMargin)) return { ...base, source: base.name ? 'category' : 'default' };
  return {
    ...base,
    targetMargin,
    minMargin: Math.min(base.minMargin ?? 0, targetMargin),
    source: 'product',
  };
}

const r2 = (n) => Math.round((n || 0) * 100) / 100;

/**
 * Calculate suggested retail prices for a given cost + margin rule.
 * @param {number} cost - cost price (exc VAT)
 * @param {object} rule - { targetMargin, minMargin, maxMargin, vatRate }
 * @returns {object} full price breakdown
 */
function calcBreakdown(cost, rule) {
  const { targetMargin = 30, minMargin = 15, maxMargin = 0, vatRate = 20 } = rule;
  const vat = vatRate / 100;

  const calcRetailInc = (margin) => {
    if (margin >= 100) return r2(cost * (1 + vat));
    const excVat = cost / (1 - margin / 100);
    const incVat = excVat * (1 + vat);
    return Math.ceil(incVat * 20) / 20; // round up to nearest £0.05
  };

  const suggestedRetailIncVat = calcRetailInc(targetMargin);
  const suggestedRetailExcVat = r2(suggestedRetailIncVat / (1 + vat));
  const vatAmount = r2(suggestedRetailIncVat - suggestedRetailExcVat);
  const actualMargin = suggestedRetailExcVat > 0
    ? r2((suggestedRetailExcVat - cost) / suggestedRetailExcVat * 100)
    : 0;
  const minRetailPrice = calcRetailInc(minMargin);
  const maxRetailPrice = maxMargin > 0 ? calcRetailInc(maxMargin) : null;

  return {
    costPrice:              r2(cost),
    targetMargin,
    suggestedRetailExcVat,
    suggestedRetailIncVat,
    vatAmount,
    actualMargin,
    minRetailPrice,
    maxRetailPrice,
  };
}

/**
 * Classify margin status of a current retail price against a rule.
 * @returns {'green'|'amber'|'red'}
 */
function marginStatus(currentRetailIncVat, cost, rule) {
  const { minMargin = 15, vatRate = 20 } = rule;
  const excVat = currentRetailIncVat / (1 + vatRate / 100);
  const actual = excVat > 0 ? (excVat - cost) / excVat * 100 : 0;
  if (actual < minMargin)                          return 'red';
  if (actual < minMargin * 1.2)                    return 'amber'; // within 20% of min
  return 'green';
}

module.exports = { UK_DEFAULTS, getOrCreate, getRule, getRuleForProduct, calcBreakdown, marginStatus };
