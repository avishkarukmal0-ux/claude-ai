// Temperature log (Fresh group) — the fridge/freezer readings a food business must keep (Food Safety Act /
// FSA Safer Food Better Business). Local-first, workspace-scoped + synced (temperature_log_v1). A reading is a
// record only; nothing else reads from it. Pure helpers are unit-tested.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { actorName } from './actor';

const NAME = 'temperature_log_v1';

// FSA guidance: chilled food at or below 8°C (aim 0–5°C); frozen at or below -18°C. We flag a reading that
// breaches the legal ceiling so it can be acted on. Source surfaced in the UI.
export const UNIT_KINDS = {
  chilled: { label: 'Fridge / chilled', max: 8, min: 0, hint: 'At or below 8°C (aim 0–5°C)' },
  frozen: { label: 'Freezer / frozen', max: -18, min: null, hint: 'At or below −18°C' },
};

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function persist(list) { return writeJSON(NAME, list); }
function newId() {
  try { if (crypto?.randomUUID) return `temp_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Is a reading within the safe range for its kind? Pure. Returns true/false. */
export function readingSafe(kind, tempC) {
  const spec = UNIT_KINDS[kind];
  const t = Number(tempC);
  if (!spec || !Number.isFinite(t)) return true; // unknown kind / no reading → don't cry wolf
  if (spec.max != null && t > spec.max + 1e-9) return false;
  if (spec.min != null && t < spec.min - 1e-9) return false;
  return true;
}

export function useTemperatureLog() {
  const [readings, setReadings] = useState(load);
  useEffect(() => {
    const refresh = () => setReadings(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('vendora:workspace', refresh); };
  }, []);
  const persistAll = (next) => { const res = persist(next); if (res.ok) setReadings(next); return res; };

  /** Record a reading. @returns {ok, reading?} | {ok:false, error} */
  const addReading = useCallback(({ unit = '', kind = 'chilled', tempC }) => {
    const t = tempC === '' || tempC == null ? NaN : Number(tempC); // empty must not parse to 0°C
    if (!Number.isFinite(t)) return { ok: false, error: 'Enter the temperature in °C.' };
    if (!UNIT_KINDS[kind]) return { ok: false, error: 'Pick chilled or frozen.' };
    const r = { id: newId(), unit: String(unit || '').trim() || UNIT_KINDS[kind].label, kind, tempC: t, safe: readingSafe(kind, t), by: actorName(), at: Date.now() };
    const res = persistAll([r, ...load()]);
    return res.ok ? { ok: true, reading: r } : res;
  }, []);

  const removeReading = useCallback((id) => persistAll(load().filter((r) => r.id !== id)), []);

  return { readings, addReading, removeReading };
}
