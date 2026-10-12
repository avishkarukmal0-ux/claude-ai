// UK shop compliance radar — the deadlines an indie shop can get caught out by.
// `date` items get a live countdown; `ongoing` items are standing obligations.
// `families`: 'all' or specific family ids. Every item carries `source` (official link) and the whole set a
// `VERIFIED` date, surfaced in the UI so a shopkeeper can always check the primary source.
// `requiresMtd: true` items only apply when MTD for Income Tax applies to this shop (see lib/businessProfile).
import { mtdApplies } from '../lib/businessProfile';

export const COMPLIANCE_VERIFIED = '2026-10-12';

export const COMPLIANCE_ITEMS = [
  // Universal tax/employment
  { id: 'mtd-q',  name: 'MTD quarterly update',   date: '2026-11-07', families: ['all'], requiresMtd: true, note: 'Digital income-tax update to HMRC', source: 'https://www.gov.uk/guidance/sign-up-your-business-for-making-tax-digital-for-income-tax' },
  { id: 'sa',     name: 'Self Assessment / MTD year-end', date: '2027-01-31', families: ['all'], note: 'Final tax return & balancing payment', source: 'https://www.gov.uk/self-assessment-tax-returns' },
  { id: 'nlw',    name: 'National Living Wage rise', date: '2027-04-01', families: ['all'], note: 'New minimum pay rates take effect', source: 'https://www.gov.uk/national-minimum-wage-rates' },
  { id: 'vat',    name: 'VAT return',              ongoing: true, families: ['all'], note: 'Every quarter — check your own VAT dates', source: 'https://www.gov.uk/vat-returns' },

  // Grocery & age-restricted
  { id: 'vpd',    name: 'Vaping Products Duty',    date: '2026-10-01', families: ['grocery-age'], note: 'New duty on vape liquids (paid upstream)', source: 'https://www.gov.uk/government/publications/introduction-of-vaping-products-duty' },
  { id: 'vape-stamp', name: 'Vape duty stamps required', date: '2027-04-01', families: ['grocery-age'], note: 'Unstamped stock sellable until 31 Mar 2027', source: 'https://www.gov.uk/government/publications/introduction-of-vaping-products-duty' },
  { id: 'disposable-ban', name: 'Disposable vape ban', ongoing: true, families: ['grocery-age'], note: 'Illegal to sell single-use vapes (since 1 Jun 2025)', source: 'https://www.gov.uk/government/news/single-use-vapes-banned-to-protect-childrens-health-and-environment' },
  { id: 'drs',    name: 'Deposit Return Scheme',   date: '2027-10-01', families: ['grocery-age'], note: 'Deposits on drink containers', source: 'https://www.gov.uk/government/publications/introducing-a-deposit-return-scheme-drs-for-drinks-containers' },
  { id: 'tobacco',name: 'Tobacco track & trace',  ongoing: true, families: ['grocery-age'], note: 'Scan-in every tobacco delivery', source: 'https://www.gov.uk/guidance/tobacco-track-and-trace-retailers' },
  { id: 'licence',name: 'Alcohol premises licence', ongoing: true, families: ['grocery-age'], note: 'Keep it displayed & renewed', source: 'https://www.gov.uk/guidance/alcohol-licensing' },

  // Fresh & weighed
  { id: 'ppds-f', name: "Natasha's Law (PPDS)",    ongoing: true, families: ['fresh-weighed'], note: 'Full ingredient + allergen labels on pre-packed', source: 'https://www.food.gov.uk/business-guidance/introduction-to-allergen-labelling-changes-ppds' },
  { id: 'weights',name: 'Weights & Measures',      ongoing: true, families: ['fresh-weighed'], note: 'Scales stamped & accurate', source: 'https://www.gov.uk/weights-measures-and-packaging-the-law' },
  { id: 'temp-f', name: 'Temperature control records', ongoing: true, families: ['fresh-weighed'], note: 'Chilled ≤8°C, frozen ≤−18°C — keep a log', source: 'https://www.food.gov.uk/business-guidance/safer-food-better-business-sfbb' },

  // World & specialist foods
  { id: 'ppds-w', name: "Natasha's Law (PPDS)",    ongoing: true, families: ['world-specialist'], note: 'Allergen labels on pre-packed foods', source: 'https://www.food.gov.uk/business-guidance/introduction-to-allergen-labelling-changes-ppds' },
  { id: 'import', name: 'Imported food safety',    ongoing: true, families: ['world-specialist'], note: 'Labelling & traceability on imports', source: 'https://www.food.gov.uk/business-guidance/importing-food' },

  // Mobile & value
  { id: 'market', name: 'Market / street trading licence', ongoing: true, families: ['mobile-value'], note: 'Keep your pitch licence current', source: 'https://www.gov.uk/apply-for-a-street-trading-licence' },
];

/**
 * Compliance items for a family, split into upcoming (with countdown) and ongoing. `profile` (optional) gates
 * MTD-only items so a shop that MTD doesn't apply to isn't shown MTD deadlines.
 */
export function complianceForFamily(familyId, from = new Date(), profile = null) {
  const today = new Date(from); today.setHours(0, 0, 0, 0);
  const mtdOn = mtdApplies(profile, from);
  const mine = COMPLIANCE_ITEMS.filter((c) =>
    (c.families.includes('all') || c.families.includes(familyId)) && (!c.requiresMtd || mtdOn),
  );
  const upcoming = mine
    .filter((c) => c.date)
    .map((c) => ({ ...c, days: Math.round((new Date(c.date).setHours(0, 0, 0, 0) - today) / 86400000) }))
    .filter((c) => c.days >= 0)
    .sort((a, b) => a.days - b.days);
  const ongoing = mine.filter((c) => c.ongoing);
  return { upcoming, ongoing };
}
