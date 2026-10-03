// Local-first day-takings + cash-up store. One record per saved day:
// card + cash takings, float, counted drawer → total takings and cash variance.
// Persists to localStorage; also exposes non-hook reads for the Owner glance.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

const NAME = 'takings_v1';

function load() {
  const arr = readJSON(NAME, []);
  return Array.isArray(arr) ? arr : [];
}
function persist(entries) {
  return writeJSON(NAME, entries);
}
function newId() {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* ignore */ }
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
// LOCAL calendar date YYYY-MM-DD. Must not go via toISOString(): that converts to UTC, so local midnight
// in BST (UTC+1) would render as the PREVIOUS day and "today" would be saved/looked-up as yesterday (W14).
function todayKey(d = new Date()) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
// Month membership by the entry's BUSINESS date (its day key), not the timestamp it was saved/edited (W14).
function sameMonthByDate(dateKey, now = new Date()) {
  if (!dateKey || typeof dateKey !== 'string') return false;
  return dateKey.slice(0, 7) === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function entryTotals(e) {
  const card = Number(e.card) || 0;
  const cash = Number(e.cash) || 0;
  const float = Number(e.float) || 0;
  // Pass-through = money in the drawer that ISN'T a retail sale (PayPoint bill pay,
  // lottery, mobile top-ups). It sits in the drawer but must be excluded from takings.
  const passThrough = Number(e.passThrough) || 0;
  const counted = e.counted === '' || e.counted == null ? null : Number(e.counted);
  const takings = card + cash;                     // true retail takings
  const expectedCash = float + cash + passThrough; // what should be in the drawer
  const variance = counted == null ? null : counted - expectedCash;
  return { card, cash, float, passThrough, counted, takings, expectedCash, variance };
}

export function useTakings() {
  const [entries, setEntries] = useState(load);

  useEffect(() => {
    const refresh = () => setEntries(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('vendora:workspace', refresh);
    };
  }, []);

  // Save today's record (replaces an existing same-day record).
  const saveDay = useCallback((data) => {
    const date = data.date || todayKey();
    setEntries((prev) => {
      const rest = prev.filter((e) => e.date !== date);
      const entry = { id: newId(), date, card: Number(data.card) || 0, cash: Number(data.cash) || 0, float: Number(data.float) || 0, passThrough: Number(data.passThrough) || 0, counted: data.counted === '' || data.counted == null ? null : Number(data.counted), ts: Date.now() };
      const next = [entry, ...rest].sort((a, b) => (a.date < b.date ? 1 : -1));
      persist(next);
      return next;
    });
  }, []);

  const removeEntry = useCallback((id) => {
    setEntries((prev) => { const next = prev.filter((e) => e.id !== id); persist(next); return next; });
  }, []);

  const todayEntry = entries.find((e) => e.date === todayKey()) || null;
  const monthTakings = entries.filter((e) => sameMonthByDate(e.date)).reduce((s, e) => s + entryTotals(e).takings, 0);

  return { entries, saveDay, removeEntry, todayEntry, monthTakings };
}

// Non-hook reads for the Owner glance / home summary.
export function getTodayTakings() {
  const e = load().find((x) => x.date === todayKey());
  return e ? entryTotals(e).takings : 0;
}
export function getMonthTakings() {
  return load().filter((e) => sameMonthByDate(e.date)).reduce((s, e) => s + entryTotals(e).takings, 0);
}
