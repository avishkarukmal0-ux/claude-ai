// Keep in-progress form input alive across navigation (Phase 3.9f). HomePage mounts each screen/tab
// conditionally, so switching away UNMOUNTS a form and drops its local React state. Delivery receiving and
// stocktake already autosave to their stores; these lighter forms (add product, scan "add unknown", invoice
// review lines) didn't. `useFormDraft` transparently autosaves the form's state to a device-local key and
// restores it on next mount, so a tab switch / accidental back no longer loses typing. Cleared on save or
// cancel. Device-local only: these keys are NOT workspace-scoped stores, so they never sync and never land
// in a backup.
import { useState, useEffect, useRef } from 'react';
import { getActiveWorkspace } from './storage';

// Audit FE2: scope draft keys UNDER the active workspace (`vendora:<ws>:formdraft:<key>`) so that (a) one shop
// can't read a half-typed product/cost left by another on a shared device, and (b) purgeWorkspace() on
// sign-out/shop-switch — which clears every `vendora:<ws>:` key — removes them too. The legacy unscoped key
// (`vendora:formdraft:<key>`) is proactively deleted so it can't shadow or leak.
const scopedKey = (key, ws = getActiveWorkspace()) => `vendora:${ws}:formdraft:${key}`;
const legacyKey = (key) => `vendora:formdraft:${key}`;

export function loadFormDraft(key) {
  try { const r = localStorage.getItem(scopedKey(key)); return r ? JSON.parse(r) : null; }
  catch { return null; }
}
export function saveFormDraft(key, value) {
  try { localStorage.setItem(scopedKey(key), JSON.stringify(value)); } catch { /* ignore (quota/private mode) */ }
  try { localStorage.removeItem(legacyKey(key)); } catch { /* ignore */ } // retire any pre-scoping draft
}
export function clearFormDraft(key) {
  try { localStorage.removeItem(scopedKey(key)); } catch { /* ignore */ }
  try { localStorage.removeItem(legacyKey(key)); } catch { /* ignore */ }
}

/**
 * Like useState, but the value is restored from (and autosaved to) a device-local draft under `key`.
 * The restored draft is merged over `initial` so new fields added later still get a default. Returns
 * [state, setState, clear]; call clear() after a successful save or an explicit cancel.
 */
export function useFormDraft(key, initial) {
  const [state, setState] = useState(() => {
    const d = loadFormDraft(key);
    return d && typeof d === 'object' && !Array.isArray(d) ? { ...initial, ...d } : (d != null ? d : initial);
  });
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; } // nothing changed yet — don't rewrite the draft
    saveFormDraft(key, state);
  }, [key, state]);
  const clear = () => clearFormDraft(key);
  return [state, setState, clear];
}
