// SINGLE SOURCE OF COMPLIANCE RULES (ground rule 2).
// Every rule a shop could be shown lives here as EDITABLE DATA, never as logic, so a rule can be corrected
// without a code release. Research done 12 Oct 2026; each item is tagged:
//   confidence: 'verified'  — confirmed in an official / council / regulator source
//               'reported'  — secondary source, or nations differ (treat as editable, don't hard-code logic)
// Items that are OPEN (not confirmed) are NOT encoded as rules — they appear as "check with <authority>" notes
// in the relevant tool, never as a hard-coded date/limit/penalty.
//
// Shape: { id, name, text, sourceUrl, confidence, lastVerified, nations, families, date?, ongoing?, note?,
//          requiresMtd? }
//   nations  — [] means all UK nations; otherwise the subset it applies to
//   families — ['all'] or specific shop-type family ids (radar scoping)
//   date     — gives a live countdown; ongoing — a standing obligation
//   note     — short line shown in the radar
export const COMPLIANCE_VERIFIED = '2026-10-12';
export const NATIONS = ['england', 'scotland', 'wales', 'ni'];

// Vape product limits (Tobacco and Related Products Regulations 2016) — verified. Used by the Vape product
// check tool. Editable here so a change needs no code release.
export const VAPE_LIMITS = {
  nicotineMaxMgMl: 20,   // nicotine strength max 20 mg/ml
  refillMaxMl: 10,       // refill container max 10 ml
  tankMaxMl: 2,          // refillable tank max 2 ml
  confidence: 'verified',
  lastVerified: COMPLIANCE_VERIFIED,
  mhraUrl: 'https://www.gov.uk/government/collections/mhra-e-cigarette-and-vape-products-guidance-hub',
  sourceUrl: 'https://www.businesscompanion.info/focus/vaping-products/manufacturing-importing-or-selling-vapes',
};

// Age-of-sale rules used by the Age check helper. The tobacco dates are REPORTED (confirm commencement per
// nation) so they live as editable data, never hard-coded logic.
export const AGE_RULES = {
  alcoholMinAge: 18,      // verified (statute via council licence docs)
  vapeMinAge: 18,         // verified
  tobaccoMinAge: 18,      // verified
  tobaccoBornOnOrBefore: '2008-12-31', // reported: no sale to anyone born on/after 1 Jan 2009
  generationalBanFrom: '2027-01-01',   // reported: confirm England commencement
  scotlandChallengeAge: 25, // verified: Scotland age-verification policy minimum is 25
  confidence: 'reported',
  lastVerified: COMPLIANCE_VERIFIED,
  sourceUrl: 'https://www.gov.uk/government/news/tobacco-and-vapes-bill-becomes-law',
};

export const COMPLIANCE_ITEMS = [
  // ---- Universal tax / pricing / employment ---------------------------------
  {
    id: 'mtd-q', name: 'MTD quarterly update', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['all'], date: '2026-11-07', requiresMtd: true,
    note: 'Digital income-tax update to HMRC',
    text: 'Making Tax Digital for Income Tax: quarterly updates (standard dates 7 Aug, 7 Nov, 7 Feb, 7 May). Sole traders/landlords only; mandatory over £50k from 6 Apr 2026, over £30k from 6 Apr 2027. A £20k threshold is planned but not yet in legislation.',
    sourceUrl: 'https://www.gov.uk/guidance/check-when-to-sign-up-for-making-tax-digital-for-income-tax',
  },
  {
    id: 'sa', name: 'Self Assessment / MTD year-end', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['all'], date: '2027-01-31',
    note: 'Final tax return & balancing payment',
    text: 'Self Assessment tax return and balancing payment are due by 31 January.',
    sourceUrl: 'https://www.gov.uk/self-assessment-tax-returns',
  },
  {
    id: 'vat', name: 'VAT return', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['all'], ongoing: true,
    note: 'Every quarter — check your own VAT dates',
    text: 'VAT-registered businesses file a VAT return (usually quarterly) on their own VAT dates.',
    sourceUrl: 'https://www.gov.uk/vat-returns',
  },
  {
    id: 'pmo', name: 'Price Marking Order', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['all'], ongoing: true,
    note: 'Show the VAT-inclusive selling price + unit price',
    text: 'The selling price shown to the customer must be the final price to pay including VAT and other taxes (excluding a refundable deposit). Unit prices (e.g. per kg, per litre, per 100g) must be shown where applicable, including for multibuys, loyalty prices and online. Some items are exempt (Schedule 2 — check the Order).',
    sourceUrl: 'https://www.gov.uk/government/publications/price-marking-order-2004-government-guidance/price-marking-order-2004-government-guidance',
  },
  {
    id: 'nlw', name: 'National Living Wage rise', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['all'], date: '2027-04-01',
    note: 'New minimum pay rates take effect',
    text: 'New National Minimum / Living Wage rates usually take effect on 1 April.',
    sourceUrl: 'https://www.gov.uk/national-minimum-wage-rates',
  },

  // ---- Grocery & age-restricted --------------------------------------------
  {
    id: 'vpd', name: 'Vaping Products Duty', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['grocery-age'], date: '2026-10-01',
    note: 'Duty paid upstream; reaches you via supplier prices',
    text: 'Vaping Products Duty is £2.20 per 10ml from 1 Oct 2026 on all e-liquid (any nicotine strength, including nicotine-free). It is paid by manufacturers, importers and approved warehousekeepers — not retailers.',
    sourceUrl: 'https://www.gov.uk/government/news/new-vaping-products-duty-comes-into-effect',
  },
  {
    id: 'vape-stamp', name: 'Vape duty stamps required', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['grocery-age'], date: '2027-04-01',
    note: 'Unstamped stock sellable until 31 Mar 2027',
    text: 'Unstamped vape stock held before 1 Oct 2026 can be sold until 31 March 2027. From 1 April 2027 every vape retail pack must carry a valid duty stamp.',
    sourceUrl: 'https://www.gov.uk/government/publications/introduction-of-vaping-products-duty-from-1-october-2026/introduction-of-vaping-products-duty-from-1-october-2026',
  },
  {
    id: 'disposable-ban', name: 'Disposable vape ban', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['grocery-age'], ongoing: true,
    note: 'Illegal to sell single-use vapes (since 1 Jun 2025)',
    text: 'Since 1 June 2025 it is illegal across the UK to sell, offer or hold for sale single-use (disposable) vapes — in shops or online, nicotine or not. A vape is single-use if refillable-but-not-rechargeable, rechargeable-but-not-refillable, or its coil cannot be easily replaced. Separate and label any leftover stock as unsellable.',
    sourceUrl: 'https://www.stirling.gov.uk/business-and-licences/trading-standards/single-use-vapes-ban',
  },
  {
    id: 'tva-age', name: 'Age-of-sale extended to all nicotine products', confidence: 'reported', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['grocery-age'], date: '2026-10-29',
    note: 'Confirm commencement for your nation',
    text: 'Tobacco and Vapes Act 2026 (reported): from 29 Oct 2026 the age of sale is extended to all consumer nicotine products (incl. zero-nicotine vapes and nicotine pouches), with a proxy-purchase ban, extended vending-machine ban, and a ban on free distribution and discounting. Commencement dates differ by nation — confirm yours.',
    sourceUrl: 'https://www.gov.uk/government/news/tobacco-and-vapes-bill-becomes-law',
  },
  {
    id: 'tva-genban', name: 'Generational tobacco ban + signage', confidence: 'reported', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['grocery-age'], date: '2027-01-01',
    note: 'Born on/after 1 Jan 2009 — confirm England commencement',
    text: 'Reported start 1 Jan 2027 (per a Northern Ireland commencement summary): no tobacco sales to anyone born on or after 1 Jan 2009, plus required signage. The gov.uk announcement gives no date and England commencement regulations were not found — confirm before relying on it.',
    sourceUrl: 'https://www.gov.uk/government/news/tobacco-and-vapes-bill-becomes-law',
  },
  {
    id: 'tva-ads', name: 'Vape advertising/sponsorship ban', confidence: 'reported', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['grocery-age'], date: '2027-06-01',
    note: 'Provisional — depends on regulations naming a date',
    text: 'Reported provisional date 1 Jun 2027 for a ban on advertising and sponsorship of vapes and nicotine products. Depends on regulations naming a commencement date — confirm before relying on it.',
    sourceUrl: 'https://www.gov.uk/government/news/tobacco-and-vapes-bill-becomes-law',
  },
  {
    id: 'tva-tbc', name: 'Vape flavour / display / licensing rules', confidence: 'reported', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['grocery-age'], ongoing: true,
    note: 'Date TBC — flavour descriptors, display limits, retail licensing',
    text: 'No fixed date yet for flavour-descriptor limits, retail display restrictions and a retail licensing/registration scheme under the Tobacco and Vapes Act. Dates to be set by regulations — do not assume a deadline.',
    sourceUrl: 'https://www.gov.uk/government/news/tobacco-and-vapes-bill-becomes-law',
  },
  {
    id: 'cbd', name: 'CBD novel-food authorisation', confidence: 'reported', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['grocery-age'], ongoing: true,
    note: 'Check the FSA public list — authorisation decision pending',
    text: 'CBD is a novel food. The FSA keeps a public list of products allowed to remain on sale; a Sept 2026 FSA board paper recommended authorising three products (adult limit 10mg/day, with warnings) but ministers had not decided as of 12 Oct 2026. Check each product is on the FSA public list; limits are not confirmed — do not assume them.',
    sourceUrl: 'https://www.food.gov.uk/business-guidance/cannabidiol-cbd',
  },
  {
    id: 'tobacco', name: 'Tobacco track & trace', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['grocery-age'], ongoing: true,
    note: 'Scan-in every tobacco delivery',
    text: 'Record and scan in every tobacco delivery under the tobacco track & trace system.',
    sourceUrl: 'https://www.gov.uk/guidance/tobacco-track-and-trace-retailers',
  },
  {
    id: 'licence', name: 'Alcohol premises licence', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['grocery-age'], ongoing: true,
    note: 'Keep it displayed & meet its conditions',
    text: 'Keep your alcohol premises licence displayed and meet its conditions. England/Wales require an age-verification policy (statutory age 18); Challenge 25, signage and refusals logs are usually local licence conditions — check YOUR premises licence. Scotland requires an age-verification policy set at a minimum of 25.',
    sourceUrl: 'https://www.gov.uk/guidance/alcohol-licensing',
  },
  {
    id: 'mup', name: 'Minimum Unit Pricing', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: ['scotland', 'wales'], families: ['grocery-age'], ongoing: true,
    note: '65p/unit in Scotland & Wales',
    text: 'Minimum Unit Pricing is 65p per unit in Scotland and, since 1 Oct 2026, Wales (up from 50p). It does not apply in England or Northern Ireland. Floor = 65p × ABV% × litres, rounded up to the next penny.',
    sourceUrl: 'https://www.gov.wales/minimum-pricing-alcohol-guidance-retailers',
  },

  // ---- Fresh & weighed ------------------------------------------------------
  {
    id: 'ppds-f', name: "Allergen labelling (Natasha's Law / PPDS)", confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['fresh-weighed'], ongoing: true,
    note: 'Name + full ingredients + 14 allergens emphasised on PPDS',
    text: 'Food pre-packed for direct sale (packed before the customer orders it, on the same premises) must show the food name, a full ingredients list, and the 14 allergens emphasised (bold/CAPITALS/underline/contrasting). Food packed after the customer chooses needs no label but allergen info must still be available. Regulations are the England amendment; confirm Wales/Scotland/NI on the FSA PPDS hub.',
    sourceUrl: 'https://www.food.gov.uk/business-guidance/allergen-guidance-for-food-businesses',
  },
  {
    id: 'weights', name: 'Weights & Measures', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['fresh-weighed'], ongoing: true,
    note: 'Metric pricing; verified scales; show weight & price',
    text: 'Loose goods are priced in metric (per kg; per 100g optional) with the unit price on or near the goods. Trade scales must carry a verification mark and be accurate; test weights crown-stamped. The customer must see or be told weight and price before paying. No fixed re-verification interval was found — re-verify after repair/adjustment and self-check with approved weights, recorded.',
    sourceUrl: 'https://cdn.acs.org.uk/public/AA%20Guides%20Jan%202026/Weights%20and%20Measures%20-%20ACS%20Assured%20Advice%20(2026).pdf',
  },
  {
    id: 'temp-f', name: 'Temperature control records', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: ['england', 'wales', 'ni'], families: ['fresh-weighed'], ongoing: true,
    note: 'Cold food below 8°C (5°C advised); hot-hold ≥63°C',
    text: 'In England, Wales and NI it is a legal requirement to keep cold food below 8°C (the food, not the fridge air); FSA advice is a fridge at 5°C or below. Hot-held food must not fall below 63°C. Run documented food-safety procedures based on HACCP with up-to-date records. The Welsh regulation text was not verified.',
    sourceUrl: 'https://www.food.gov.uk/business-guidance/safer-food-better-business-sfbb',
  },
  {
    id: 'fhrs', name: 'Registration & Food Hygiene Rating', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['fresh-weighed', 'world-specialist'], ongoing: true,
    note: 'Register 28 days before trading; display rating (mandatory in Wales/NI)',
    text: 'Register with the local authority at least 28 days before trading (free, cannot be refused). The council inspects and awards a Food Hygiene Rating 0–5. Displaying the rating is mandatory in Wales and Northern Ireland and voluntary in England.',
    sourceUrl: 'https://www.food.gov.uk/business-guidance/register-a-food-business',
  },

  // ---- World & specialist foods --------------------------------------------
  {
    id: 'ppds-w', name: "Allergen labelling (PPDS)", confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['world-specialist'], ongoing: true,
    note: 'Name + full ingredients + 14 allergens emphasised on PPDS',
    text: 'Same PPDS allergen rules as the Fresh group, including loose lines decanted from bulk (nuts, spices, dried fruit). Confirm per nation on the FSA PPDS hub.',
    sourceUrl: 'https://www.food.gov.uk/business-guidance/allergen-guidance-for-food-businesses',
  },
  {
    id: 'import-addr', name: 'Imported food: UK address on label', confidence: 'reported', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['world-specialist'], ongoing: true,
    note: 'GB label needs a UK postal address; NI differs',
    text: 'Reported: pre-packed food sold in Great Britain has needed a UK (or Channel Islands / Isle of Man) postal address on the label since 1 Jan 2024 — the business it is marketed under, or the importer. Northern Ireland needs an address in NI or the EU. A shop that imports directly is the legally responsible party. Confirm on FSA guidance.',
    sourceUrl: 'https://www.food.gov.uk/business-guidance/importing-food',
  },
  {
    id: 'novel', name: 'Novel foods authorised', confidence: 'reported', lastVerified: COMPLIANCE_VERIFIED,
    nations: [], families: ['world-specialist'], ongoing: true,
    note: 'Check the FSA Register of Novel Foods',
    text: 'A food not consumed to a significant degree in the UK/EU before 15 May 1997 is a novel food and must be authorised before sale in GB. The business must check novel status itself on the FSA Register.',
    sourceUrl: 'https://food.gov.uk/business-guidance/novel-foods',
  },

  // ---- Mobile & value -------------------------------------------------------
  {
    id: 'street-trading', name: 'Street trading consent', confidence: 'verified', lastVerified: COMPLIANCE_VERIFIED,
    nations: ['england', 'wales'], families: ['mobile-value'], ongoing: true,
    note: 'Set locally — consent, pitch, insurance vary by council',
    text: 'Street trading is controlled locally (Local Government (Miscellaneous Provisions) Act 1982, Sch 4 in England & Wales): councils designate licensed/prohibited/consent streets and set their own rules (applicant 18+, insurance level, notice periods, named pitch). Public liability insurance level varies by council. Scotland and NI have separate regimes.',
    sourceUrl: 'https://www.gov.uk/apply-for-a-street-trading-licence',
  },
];
