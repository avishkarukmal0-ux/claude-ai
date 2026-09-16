// UK shop compliance radar — the deadlines an indie shop can get caught out by.
// `date` items get a live countdown; `ongoing` items are standing obligations.
// `families`: 'all' or specific family ids. Update dates as rules firm up.

export const COMPLIANCE_ITEMS = [
  // Universal tax/employment
  { id: 'mtd-q',  name: 'MTD quarterly update',   date: '2026-11-07', families: ['all'], note: 'Digital income-tax update to HMRC' },
  { id: 'sa',     name: 'Self Assessment / MTD year-end', date: '2027-01-31', families: ['all'], note: 'Final tax return & balancing payment' },
  { id: 'nlw',    name: 'National Living Wage rise', date: '2027-04-01', families: ['all'], note: 'New minimum pay rates take effect' },
  { id: 'vat',    name: 'VAT return',              ongoing: true, families: ['all'], note: 'Every quarter — check your own VAT dates' },

  // Grocery & age-restricted
  { id: 'vpd',    name: 'Vaping Products Duty',    date: '2026-10-01', families: ['grocery-age'], note: 'New duty on vape liquids' },
  { id: 'drs',    name: 'Deposit Return Scheme',   date: '2027-10-01', families: ['grocery-age'], note: 'Deposits on drink containers' },
  { id: 'tobacco',name: 'Tobacco track & trace',  ongoing: true, families: ['grocery-age'], note: 'Scan-in every tobacco delivery' },
  { id: 'licence',name: 'Alcohol premises licence', ongoing: true, families: ['grocery-age'], note: 'Keep it displayed & renewed' },

  // Fresh & weighed
  { id: 'ppds-f', name: "Natasha's Law (PPDS)",    ongoing: true, families: ['fresh-weighed'], note: 'Full ingredient + allergen labels on pre-packed' },
  { id: 'weights',name: 'Weights & Measures',      ongoing: true, families: ['fresh-weighed'], note: 'Scales stamped & accurate' },

  // World & specialist foods
  { id: 'ppds-w', name: "Natasha's Law (PPDS)",    ongoing: true, families: ['world-specialist'], note: 'Allergen labels on pre-packed foods' },
  { id: 'import', name: 'Imported food safety',    ongoing: true, families: ['world-specialist'], note: 'Labelling & traceability on imports' },

  // Mobile & value
  { id: 'market', name: 'Market / street trading licence', ongoing: true, families: ['mobile-value'], note: 'Keep your pitch licence current' },
];

/** Compliance items for a family, split into upcoming (with countdown) and ongoing. */
export function complianceForFamily(familyId, from = new Date()) {
  const today = new Date(from); today.setHours(0, 0, 0, 0);
  const mine = COMPLIANCE_ITEMS.filter((c) => c.families.includes('all') || c.families.includes(familyId));
  const upcoming = mine
    .filter((c) => c.date)
    .map((c) => ({ ...c, days: Math.round((new Date(c.date).setHours(0,0,0,0) - today) / 86400000) }))
    .filter((c) => c.days >= 0)
    .sort((a, b) => a.days - b.days);
  const ongoing = mine.filter((c) => c.ongoing);
  return { upcoming, ongoing };
}
