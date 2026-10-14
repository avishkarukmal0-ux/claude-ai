// Builds the "Today at the shop" signals — a short, prioritised list tailored to the
// shop's family, the weekday, and the UK calendar. No backend; pure derivation.
// Each signal: { kind, text, tone }. `kind` maps to an icon in the component.

import { daysUntil, isLastFriday } from './dateUtils';
import { upcomingEvents } from '../config/calendar';
import { complianceForFamily } from '../config/compliance';

// Rotating day-to-day nudges per family (keeps the screen fresh without a backend).
const FAMILY_NUDGES = {
  'grocery-age': [
    'Cash-&-carry run? Build your list before you go.',
    'Date-code the milk & chilled — pull anything short.',
    'Face up the big-sellers before the rush.',
    'Check the news/mag returns are ready.',
  ],
  'fresh-weighed': [
    'Mark down today’s short-dated stock while it still sells.',
    'Waste check — what’s near use-by?',
    'Prep tomorrow’s bake to expected demand.',
    'Check the scales & labels are spot-on.',
  ],
  'world-specialist': [
    'Line up this week’s multi-supplier order.',
    'Check allergen labels on fresh & loose lines.',
    'Watch the festival calendar — order specials early.',
    'Rotate the perishables — first in, first out.',
  ],
  'mobile-value': [
    'Reconcile yesterday’s cash & card takings.',
    'Flag slow sellers to discount before they’re dead stock.',
    'Price up any new no-barcode lines.',
    'Restock the pitch for the busy days.',
  ],
};

// Per-member overrides where the family line would be wrong for that niche (e.g. an off-licence isn't a
// newsagent, so it shouldn't be told to sort "news/mag returns"). When a member has its own set it REPLACES
// the family set; otherwise the family set is used.
const MEMBER_NUDGES = {
  'off-licence': [
    'Cash-&-carry run? Build your beer, wine & spirits list first.',
    'Rotate chilled beers & mixers — pull anything short-dated.',
    'Ask for ID if a customer looks under 25.',
    'Spot-check shelf prices against the minimum unit price (Scotland/Wales).',
  ],
  'vape-cbd': [
    'New lines: check they’re on the MHRA notified list before selling.',
    'Confirm nicotine strength and bottle/tank sizes are within the limits.',
    'No single-use disposable vapes — they’re banned.',
    'Keep CBD supplier and novel-food evidence to hand.',
  ],
};

/** Should cultural-festival nudges show? OFF by default for everyone — they appear only once the owner opts in
 *  (profile.festivalsOn === true). No shop is shown Diwali/Eid unasked, regardless of family. */
export function festivalsEnabled(familyId, profile) {
  return profile?.festivalsOn === true;
}

export function buildTodaySignals(familyId, from = new Date(), { memberId = null, profile = null } = {}) {
  const signals = [];
  const day = from.getDay(); // 0 Sun … 6 Sat

  // 1) Nearest compliance deadline, if it's close (nation/MTD-gated via the profile).
  const { upcoming } = complianceForFamily(familyId, from, profile);
  if (upcoming.length && upcoming[0].days <= 45) {
    const c = upcoming[0];
    signals.push({
      kind: 'deadline',
      tone: c.days <= 7 ? 'warn' : 'info',
      text: `${c.name} in ${c.days} day${c.days === 1 ? '' : 's'}.`,
    });
  }

  // 2) Nearest seasonal/demand event — cultural festivals only when the shop opted in.
  if (festivalsEnabled(familyId, profile)) {
    const events = upcomingEvents(familyId, 60, from);
    if (events.length) {
      const e = events[0];
      const d = daysUntil(e.when, from);
      signals.push({
        kind: 'event',
        tone: 'event',
        text: d === 0 ? `${e.name} today — ${e.note}.` : `${e.name} in ${d} days — ${e.note}.`,
      });
    }
  }

  // 3) Weekend / payday demand nudge.
  if (day === 5 || day === 6) {
    signals.push({ kind: 'weekend', tone: 'tip', text: 'Weekend trade — make sure you’re stocked for the rush.' });
  }
  if (isLastFriday(from)) {
    signals.push({ kind: 'money', tone: 'tip', text: 'Payday Friday — expect bigger baskets.' });
  }

  // 4) A family-specific daily nudge (rotates by weekday). Drop the "date-code the milk & chilled" nudge for
  //    a vape & CBD shop — it doesn't sell chilled, so that prompt is noise.
  // Prefer a member-specific set (niche-correct); fall back to the family set.
  let nudges = (memberId && MEMBER_NUDGES[memberId]) || FAMILY_NUDGES[familyId] || [];
  if (nudges.length) {
    signals.push({ kind: 'tip', tone: 'neutral', text: nudges[day % nudges.length] });
  }

  return signals.slice(0, 4);
}
