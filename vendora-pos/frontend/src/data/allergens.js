// The 14 allergens that UK food law requires to be declared and emphasised (Natasha's Law / PPDS). Shared by
// the PPDS label tool and the per-product allergen picker so there is one list. Stored on a product as an array
// of these exact label strings.
export const ALLERGENS = [
  'Celery',
  'Cereals containing gluten',
  'Crustaceans',
  'Eggs',
  'Fish',
  'Lupin',
  'Milk',
  'Molluscs',
  'Mustard',
  'Nuts (tree nuts)',
  'Peanuts',
  'Sesame',
  'Soya',
  'Sulphur dioxide / sulphites',
];

// Common ingredient words that indicate each allergen, so we can emphasise them inside an ingredients list and
// flag likely allergens (e.g. "wheat flour" → Cereals containing gluten). A HELP — the owner still confirms.
export const ALLERGEN_KEYWORDS = {
  'Celery': ['celery', 'celeriac'],
  'Cereals containing gluten': ['wheat', 'barley', 'rye', 'oats', 'oat', 'spelt', 'gluten', 'flour', 'bread', 'breadcrumb'],
  'Crustaceans': ['prawn', 'crab', 'lobster', 'shrimp', 'crustacean'],
  'Eggs': ['egg', 'mayonnaise', 'albumen'],
  'Fish': ['fish', 'anchovy', 'cod', 'salmon', 'tuna', 'haddock'],
  'Lupin': ['lupin'],
  'Milk': ['milk', 'cheese', 'butter', 'cream', 'whey', 'yoghurt', 'yogurt', 'lactose', 'ghee'],
  'Molluscs': ['mussel', 'oyster', 'squid', 'snail', 'clam', 'mollusc', 'scallop'],
  'Mustard': ['mustard'],
  'Nuts (tree nuts)': ['almond', 'hazelnut', 'walnut', 'cashew', 'pecan', 'pistachio', 'macadamia', 'brazil nut'],
  'Peanuts': ['peanut', 'groundnut'],
  'Sesame': ['sesame', 'tahini'],
  'Soya': ['soya', 'soybean', 'tofu', 'edamame'],
  'Sulphur dioxide / sulphites': ['sulphite', 'sulfite', 'sulphur dioxide', 'sulfur dioxide'],
};

// All keywords, longest first (so multi-word terms match before their parts), with their allergen.
const KEYWORD_INDEX = Object.entries(ALLERGEN_KEYWORDS)
  .flatMap(([allergen, words]) => words.map((w) => ({ w: w.toLowerCase(), allergen })))
  .sort((a, b) => b.w.length - a.w.length);

/** Allergen labels whose keywords appear in an ingredients string. */
export function detectAllergens(ingredients) {
  const t = ` ${String(ingredients || '').toLowerCase()} `;
  const found = new Set();
  for (const { w, allergen } of KEYWORD_INDEX) {
    if (new RegExp(`[^a-z]${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`).test(t)) found.add(allergen);
  }
  return ALLERGENS.filter((a) => found.has(a));
}

/** Split an ingredients string into segments, marking which are allergen keyword hits (for emphasis). Returns
 *  an array of { text, hit }. Pure — the renderer decides how to emphasise (bold/CAPS for HTML, CAPS for text). */
export function emphasiseIngredients(ingredients) {
  const text = String(ingredients || '');
  if (!text) return [];
  const words = KEYWORD_INDEX.map((k) => k.w).sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const out = [];
  let last = 0; let m;
  while ((m = re.exec(text))) {
    // Only treat as a hit when on word boundaries (avoid "oat" inside "coat").
    const before = text[m.index - 1]; const after = text[m.index + m[0].length];
    const boundary = (!before || !/[a-z]/i.test(before)) && (!after || !/[a-z]/i.test(after));
    if (!boundary) continue;
    if (m.index > last) out.push({ text: text.slice(last, m.index), hit: false });
    out.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), hit: false });
  return out;
}
