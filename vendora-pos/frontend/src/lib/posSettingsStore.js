// Per-shop POS / till sales-import settings (slice 3). Workspace-scoped (readJSON/writeJSON key the active
// shop automatically), so each shop has its own setting and it never leaks across a shared device.
//
// The only setting today is the stock-DEDUCTION opt-in. It defaults OFF: importing till sales records them as
// velocity evidence without changing stock (slices 1–2). An owner/manager can turn deductions on AFTER a
// comparison period — and only from an explicit "opening baseline" moment, so historical sales already
// reflected in the shop's manual counts are never deducted a second time (design: Sales-Ingestion-Design).
//
// Framework-free core (unit-testable) + a thin React hook at the bottom.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';
import { currentRole, currentMember } from './account';
import { now as clock } from './syncClock';

const NAME = 'pos_settings_v1';
const EVENT = 'vendora:pos_settings';

const DEFAULTS = Object.freeze({
  deductEnabled: false, // OFF by default — imports are velocity-only until an owner opts in
  openingStockAt: null, // epoch ms: only sales AFTER this moment deduct (set when deductions are enabled)
  enabledBy: null,      // who turned it on (member name) — attribution
  enabledAt: null,      // when it was turned on
});

/** Owner/manager may change deduction settings; staff may not. Mirrors the screen-gating role model
 *  (a guest/legacy session with no role is treated as owner). Server enforces the same for cloud paths. */
export function canManageDeductions(role = currentRole()) {
  return role !== 'staff';
}

export function loadPosSettings() {
  const s = readJSON(NAME, null);
  if (!s || typeof s !== 'object') return { ...DEFAULTS };
  return {
    deductEnabled: !!s.deductEnabled,
    openingStockAt: Number.isFinite(Number(s.openingStockAt)) ? Number(s.openingStockAt) : null,
    enabledBy: s.enabledBy || null,
    enabledAt: Number.isFinite(Number(s.enabledAt)) ? Number(s.enabledAt) : null,
  };
}

function persist(next) {
  const res = writeJSON(NAME, next);
  if (res && res.ok) { try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* ignore */ } }
  return res;
}

/**
 * Turn stock deductions ON. Records the opening baseline = now, so ONLY sales dated after this moment are
 * ever deducted (historical sales stay as evidence only). Owner/manager only.
 * @returns { ok, reason?, settings }
 */
export function enableDeductions({ at = clock(), role = currentRole(), member = currentMember() } = {}) {
  if (!canManageDeductions(role)) return { ok: false, reason: 'forbidden', settings: loadPosSettings() };
  const next = {
    deductEnabled: true,
    openingStockAt: Number(at) || Date.now(),
    enabledBy: (member && member.name) || null,
    enabledAt: Number(at) || Date.now(),
  };
  const res = persist(next);
  return { ok: !!(res && res.ok), settings: next };
}

/** Turn deductions back OFF (imports revert to velocity-only). Keeps the baseline on record. Owner/manager
 *  only. */
export function disableDeductions({ role = currentRole() } = {}) {
  if (!canManageDeductions(role)) return { ok: false, reason: 'forbidden', settings: loadPosSettings() };
  const cur = loadPosSettings();
  const next = { ...cur, deductEnabled: false };
  const res = persist(next);
  return { ok: !!(res && res.ok), settings: next };
}

/** React hook: live POS settings + guarded mutators. */
export function usePosSettings() {
  const [settings, setSettings] = useState(loadPosSettings);
  useEffect(() => {
    const refresh = () => setSettings(loadPosSettings());
    window.addEventListener(EVENT, refresh);
    window.addEventListener('vendora:workspace', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener('vendora:workspace', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const enable = useCallback((opts) => { const r = enableDeductions(opts); if (r.ok) setSettings(r.settings); return r; }, []);
  const disable = useCallback((opts) => { const r = disableDeductions(opts); if (r.ok) setSettings(r.settings); return r; }, []);
  const canManage = canManageDeductions();

  return { settings, canManage, enableDeductions: enable, disableDeductions: disable };
}
