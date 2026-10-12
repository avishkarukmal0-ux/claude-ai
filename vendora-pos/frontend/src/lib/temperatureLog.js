// Temperature log (Fresh group) — the fridge/freezer/hot-hold/display readings a food business keeps
// (Food Safety Act / FSA SFBB). Local-first, workspace-scoped + synced (temperature_log_v1). A reading is a
// record only; nothing else reads from it. Supports a corrective-action note and a 12-month CSV export.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { actorName } from './actor';

const NAME = 'temperature_log_v1';

// FSA: chilled food at or below 8°C (aim 0–5°C); frozen at or below −18°C; hot-held food not below 63°C.
export const UNIT_KINDS = {
  chilled: { label: 'Fridge / chilled', max: 8, min: null, hint: 'At or below 8°C (aim 0–5°C)' },
  display: { label: 'Chilled display', max: 8, min: null, hint: 'At or below 8°C' },
  frozen: { label: 'Freezer / frozen', max: -18, min: null, hint: 'At or below −18°C' },
  hothold: { label: 'Hot-hold', max: null, min: 63, hint: 'At or above 63°C' },
};

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function newId() {
  try { if (crypto?.randomUUID) return `temp_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Is a reading within the safe range for its kind? Pure. */
export function readingSafe(kind, tempC) {
  const spec = UNIT_KINDS[kind];
  const t = Number(tempC);
  if (!spec || !Number.isFinite(t)) return true;
  if (spec.max != null && t > spec.max + 1e-9) return false;
  if (spec.min != null && t < spec.min - 1e-9) return false;
  return true;
}

/** CSV of the log for records (kept ~12 months). Pure + unit-tested. */
export function temperatureCsv(list = []) {
  const rows = [['Date', 'Time', 'Unit', 'Type', '°C', 'In range', 'Action', 'By']];
  for (const r of Array.isArray(list) ? list : []) {
    const d = new Date(r.at);
    rows.push([
      d.toLocaleDateString('en-GB'), d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      r.unit || '', UNIT_KINDS[r.kind]?.label || r.kind || '', String(r.tempC), r.safe ? 'yes' : 'NO', r.action || '', r.by || '',
    ]);
  }
  return rows.map((c) => c.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function useTemperatureLog() {
  const [readings, setReadings] = useState(load);
  useEffect(() => {
    const refresh = () => setReadings(load());
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    return () => { window.removeEventListener('storage', refresh); window.removeEventListener('vendora:workspace', refresh); };
  }, []);
  const persistAll = (next) => { const res = writeJSON(NAME, next); if (res.ok) setReadings(next); return res; };

  /** Record a reading. @returns {ok, reading?} | {ok:false, error} */
  const addReading = useCallback(({ unit = '', kind = 'chilled', tempC, action = '' }) => {
    const t = tempC === '' || tempC == null ? NaN : Number(tempC); // empty must not parse to 0°C
    if (!Number.isFinite(t)) return { ok: false, error: 'Enter the temperature in °C.' };
    if (!UNIT_KINDS[kind]) return { ok: false, error: 'Pick a unit type.' };
    const safe = readingSafe(kind, t);
    const r = { id: newId(), unit: String(unit || '').trim() || UNIT_KINDS[kind].label, kind, tempC: t, safe, action: safe ? '' : String(action || '').trim(), by: actorName(), at: Date.now() };
    const res = persistAll([r, ...load()]);
    return res.ok ? { ok: true, reading: r } : res;
  }, []);

  const removeReading = useCallback((id) => persistAll(load().filter((r) => r.id !== id)), []);

  return { readings, addReading, removeReading };
}
