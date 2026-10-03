// Seasonal / demand calendar — key UK retail dates that shift buying behaviour.
// Each event names the families it matters most to ('all' = everyone). Dates are the
// next occurrence; approximate ones (lunar festivals) are flagged. Update yearly.

export const CALENDAR_EVENTS = [
  { id: 'diwali-2026',    name: 'Diwali',            date: '2026-11-08', emoji: '🪔', families: ['world-specialist', 'grocery-age'], note: 'Order sweets, snacks & lights early' },
  { id: 'christmas-2026', name: 'Christmas',         date: '2026-12-25', emoji: '🎄', families: ['all'], note: 'Peak trading — stock up & plan cover' },
  { id: 'boxing-2026',    name: 'Boxing Day',        date: '2026-12-26', emoji: '📦', families: ['all'], note: 'Fizz, snacks & the big shop' },
  { id: 'newyear-2027',   name: "New Year's Eve",    date: '2026-12-31', emoji: '🎉', families: ['grocery-age', 'world-specialist'], note: 'Drinks & party lines' },
  { id: 'valentines-2027',name: "Valentine's Day",   date: '2027-02-14', emoji: '❤️', families: ['all'], note: 'Cards, flowers & chocolates' },
  { id: 'mothers-2027',   name: "Mother's Day (UK)", date: '2027-03-14', emoji: '💐', families: ['all'], note: 'Flowers, cards & gifts' },
  { id: 'eid-2027',       name: 'Eid al-Fitr (approx)', date: '2027-03-20', emoji: '🌙', families: ['world-specialist', 'grocery-age'], note: 'Dates approximate — confirm locally' },
];

/** Upcoming events for a family within `withinDays`, soonest first. */
export function upcomingEvents(familyId, withinDays = 60, from = new Date()) {
  const today = new Date(from); today.setHours(0, 0, 0, 0);
  return CALENDAR_EVENTS
    .map((e) => ({ ...e, when: new Date(e.date) }))
    .filter((e) => (e.families.includes('all') || e.families.includes(familyId)))
    .filter((e) => {
      const diff = Math.round((new Date(e.when).setHours(0,0,0,0) - today) / 86400000);
      return diff >= 0 && diff <= withinDays;
    })
    .sort((a, b) => a.when - b.when);
}
