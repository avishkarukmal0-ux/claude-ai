// Small shared date helpers (no deps).
export function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysUntil(target, from = new Date()) {
  return Math.round((startOfDay(target) - startOfDay(from)) / 86400000);
}

export function formatUK(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Is `date` the last Friday of its month? (rough payday signal) */
export function isLastFriday(date = new Date()) {
  if (date.getDay() !== 5) return false;
  const d = new Date(date);
  d.setDate(d.getDate() + 7);
  return d.getMonth() !== date.getMonth();
}
