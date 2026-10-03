// Product category suggestions. Categories are NOT in the barcode — the shop assigns them. We offer
// sensible presets per shop family so categorising is a tap, not a typing exercise, and the Stock list
// groups by them. The field is still free-text, so a shop can add its own.

const COMMON = [
  'Confectionery', 'Crisps & snacks', 'Soft drinks', 'Water & juice', 'Hot drinks',
  'Grocery & tinned', 'Bakery & bread', 'Chilled & dairy', 'Frozen', 'Household & cleaning',
  'Toiletries & health', 'Baby', 'Pet', 'Stationery & cards', 'Other',
];

// Family-specific additions (prepended so the most relevant show first). Keys match SHOP_FAMILIES ids.
const BY_FAMILY = {
  'grocery-age': ['Tobacco & vapes', 'Beer, wine & spirits', 'News & magazines', 'Lottery & scratchcards', 'Vaping & e-liquids'],
  'fresh-weighed': ['Fruit & veg', 'Meat & poultry', 'Fish & seafood', 'Deli & cheese', 'Bakery (fresh)'],
  'world-specialist': ['World foods', 'Rice, flour & pulses', 'Spices & seasoning', 'Fresh produce', 'Health & supplements'],
  'mobile-value': ['Household value', 'Toys & gifts', 'Electrical & batteries', 'Seasonal', 'Pet & garden'],
};

/** Suggested categories for a shop family (family-specific first, then common), de-duplicated. */
export function categoriesForFamily(familyId) {
  const extra = BY_FAMILY[familyId] || [];
  const seen = new Set();
  return [...extra, ...COMMON].filter((c) => (seen.has(c) ? false : seen.add(c)));
}

/** Distinct categories already used across the shop's products (sorted), for quick re-selection. */
export function categoriesInUse(products = []) {
  const set = new Set();
  for (const p of products) if (p && p.category) set.add(p.category);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export const UNCATEGORISED = 'Uncategorised';
