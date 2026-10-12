// Compliance LOGIC layer. All rules live as editable data in src/data/compliance.js (ground rule 2); this file
// only filters/sorts them for the UI. `requiresMtd` items are gated by the business profile; `nations`-scoped
// items are gated by the shop's nation (profile.region). An item with nations: [] applies everywhere.
import { mtdApplies } from '../lib/businessProfile';
import { COMPLIANCE_ITEMS, COMPLIANCE_VERIFIED, NATIONS } from '../data/compliance';

export { COMPLIANCE_ITEMS, COMPLIANCE_VERIFIED, NATIONS };

function appliesToNation(item, nation) {
  if (!item.nations || item.nations.length === 0) return true; // all nations
  if (!nation) return true; // nation unknown → don't hide (the tool/note still says "check your nation")
  return item.nations.includes(nation);
}

/**
 * Compliance items for a family, split into upcoming (with countdown) and ongoing.
 * `profile` (optional) gates MTD-only items and nation-scoped items.
 */
export function complianceForFamily(familyId, from = new Date(), profile = null) {
  const today = new Date(from); today.setHours(0, 0, 0, 0);
  const mtdOn = mtdApplies(profile, from);
  const nation = profile?.region || null;
  const mine = COMPLIANCE_ITEMS.filter((c) =>
    (c.families.includes('all') || c.families.includes(familyId))
    && (!c.requiresMtd || mtdOn)
    && appliesToNation(c, nation),
  );
  const upcoming = mine
    .filter((c) => c.date)
    .map((c) => ({ ...c, days: Math.round((new Date(c.date).setHours(0, 0, 0, 0) - today) / 86400000) }))
    .filter((c) => c.days >= 0)
    .sort((a, b) => a.days - b.days);
  const ongoing = mine.filter((c) => c.ongoing);
  return { upcoming, ongoing };
}
