// Durable recovery guard (audit R3/R4, round 3).
//
// Some local-first actions write to TWO independent stores (product stock + the movement ledger, or a delivery's
// stock + its operation record). When the SECOND write fails AND the compensating rollback ALSO fails, the device
// is left in an unsafe state: stock changed, but the paired record didn't, and it couldn't be undone. A plain
// "please retry" is dangerous — a naive retry re-applies the change and double-counts.
//
// Round 2 blocked that retry with COMPONENT state, which resets on reload/navigation — so reopening the screen or
// reloading the app let the retry through again (audit R3/R4). This store makes the block DURABLE: a needs-recovery
// record is persisted (workspace-scoped, device-local — not in STORE_NAMES, so it never syncs) and survives reload.
// The affected screens read it, keep blocking the action, and only let the owner proceed once they have reloaded,
// verified the real stock, and explicitly cleared the flag.
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

const NAME = 'recovery_guard_v1';
export const RECOVERY_EVENT = 'vendora:recovery';

function load() {
  const m = readJSON(NAME, {});
  return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
}
function persist(m) { return writeJSON(NAME, m); }
function emit(detail) { try { window.dispatchEvent(new CustomEvent(RECOVERY_EVENT, { detail })); } catch { /* non-browser */ } }

/** Record that an operation reached an unsafe needs-recovery state. `opKey` is a stable identity that survives
 *  reload (e.g. `delivery:<id>`, `product:<id>`, `stocktake`). */
export function recordRecovery(opKey, detail = {}) {
  if (!opKey) return { ok: false };
  const m = load();
  m[opKey] = { at: Date.now(), ...detail };
  const res = persist(m);
  emit({ opKey });
  return res;
}
/** True while `opKey` is flagged as needing recovery. */
export function hasRecovery(opKey) { return !!(opKey && load()[opKey]); }
/** Clear a recovery flag — the owner has reloaded and verified the real stock. */
export function clearRecovery(opKey) {
  if (!opKey) return { ok: true };
  const m = load();
  if (!(opKey in m)) return { ok: true };
  delete m[opKey];
  const res = persist(m);
  emit({ opKey, cleared: true });
  return res;
}
/** All current recovery records as [{ opKey, at, ... }]. */
export function listRecovery() { return Object.entries(load()).map(([opKey, v]) => ({ opKey, ...(v || {}) })); }

/** React hook: live recovery flags + helpers. Re-reads on recovery changes, workspace switch, and cross-tab. */
export function useRecoveryGuard() {
  const [guards, setGuards] = useState(load);
  useEffect(() => {
    const refresh = () => setGuards(load());
    window.addEventListener(RECOVERY_EVENT, refresh);
    window.addEventListener('vendora:workspace', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(RECOVERY_EVENT, refresh);
      window.removeEventListener('vendora:workspace', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  const has = useCallback((opKey) => !!(opKey && guards[opKey]), [guards]);
  const record = useCallback((opKey, detail) => { const r = recordRecovery(opKey, detail); setGuards(load()); return r; }, []);
  const clear = useCallback((opKey) => { const r = clearRecovery(opKey); setGuards(load()); return r; }, []);
  const list = useCallback(() => Object.entries(guards).map(([opKey, v]) => ({ opKey, ...(v || {}) })), [guards]);
  return { guards, has, record, clear, list };
}
