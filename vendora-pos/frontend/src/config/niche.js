// SINGLE SOURCE OF TRUTH for "what does this shop type get?" — tools, nudges, demo data and onboarding
// questions, resolved from one place. The 11 shop types are 4 groups; letting each concern decide niche
// behaviour on its own is exactly how Scan/Stock/Buy/More drifted into identical clones. Everything
// niche-dependent now goes through resolveNiche() so a difference lives in one object, not scattered logic.
import { getFamily } from './shopTypes';
import { getQuickToolsForShop } from './quickTools';
import { buildTodaySignals } from '../lib/todaySignals';
import { demoCatalogue } from '../lib/demo';

// Which onboarding questions apply to a family. The tax/nation/size set is universal; the rest are scoped so a
// shop isn't asked things that don't apply to it (a greengrocer isn't asked about live animals).
export function onboardingQuestionsFor(familyId) {
  const q = ['entity', 'turnoverBand', 'region', 'employees50'];
  if (familyId === 'mobile-value') q.push('sellsAnimals');
  if (familyId === 'world-specialist' || familyId === 'fresh-weighed') q.push('importsFood');
  if (familyId === 'world-specialist' || familyId === 'grocery-age') q.push('festivalsOn');
  return q;
}

/**
 * Resolve everything that depends on the shop type into one object.
 * @param {{familyId, memberId?, profile?}} shop
 * @returns {{ group, member, accent, tools, nudges, demoData, onboardingQuestions }}
 */
export function resolveNiche({ familyId, memberId = null, profile = null } = {}, now = new Date()) {
  const family = getFamily(familyId);
  return {
    group: familyId,
    member: memberId,
    accent: family?.accent || null,
    tools: getQuickToolsForShop({ familyId, memberId, profile }, now),
    nudges: buildTodaySignals(familyId, now, { memberId, profile }),
    demoData: demoCatalogue(familyId, memberId),
    onboardingQuestions: onboardingQuestionsFor(familyId),
  };
}
