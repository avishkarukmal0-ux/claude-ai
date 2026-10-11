// Keep in-progress form input alive across navigation (Phase 3.9f). HomePage mounts each screen/tab
// conditionally, so switching away UNMOUNTS a form and drops its local React state. Delivery receiving and
// stocktake already autosave to their stores; these lighter forms (add product, scan "add unknown", invoice
// review lines) didn't. `useFormDraft` transparently autosaves the form's state to a device-local key and
// restores it on next mount, so a tab switch / accidental back no longer loses typing. Cleared on save or
// cancel. Device-local only: these keys are NOT workspace-scoped stores, so they never sync and never land
// in a backup.
import { useState, useEffect, useRef } from 'react';
import { getActiveWorkspace, WORKSPACE_EVENT } from './storage';

// Audit FE2: scope draft keys UNDER the active workspace (`vendora:<ws>:formdraft:<key>`) so that (a) one shop
// can't read a half-typed product/cost left by another on a shared device, and (b) purgeWorkspace() on
// sign-out/shop-switch — which clears every `vendora:<ws>:` key — removes them too. The legacy unscoped key
// (`vendora:formdraft:<key>`) is proactively deleted so it can't shadow or leak.
const scopedKey = (key, ws = getActiveWorkspace()) => `vendora:${ws}:formdraft:${key}`;
const legacyKey = (key) => `vendora:formdraft:${key}`;

export function loadFormDraft(key, ws = getActiveWorkspace()) {
  try { const r = localStorage.getItem(scopedKey(key, ws)); return r ? JSON.parse(r) : null; }
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
  const restore = (ws) => {
    const d = loadFormDraft(key, ws);
    return d && typeof d === 'object' && !Array.isArray(d) ? { ...initial, ...d } : (d != null ? d : initial);
  };
  const [state, setState] = useState(() => restore());
  const firstRun = useRef(true);
  const initialRef = useRef(initial); initialRef.current = initial;
  const wsRef = useRef(getActiveWorkspace());
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; } // nothing changed yet — don't rewrite the draft
    saveFormDraft(key, state);
  }, [key, state]);
  // Audit F5: a form stays MOUNTED across an account/workspace switch (HomePage doesn't unmount it). Its scoped
  // draft key is correct, but the in-memory state still holds shop A's typing — which the autosave above would
  // then write under shop B's key, and which the user could save into B. On a workspace change, reset the mounted
  // state to the NEW workspace's draft (or initial). Shop A's draft was already saved under A's key before the switch.
  useEffect(() => {
    const onWs = () => {
      const ws = getActiveWorkspace();
      if (ws === wsRef.current) return;
      wsRef.current = ws;
      firstRun.current = true; // the reset itself must not rewrite the draft
      const d = loadFormDraft(key, ws);
      setState(d && typeof d === 'object' && !Array.isArray(d) ? { ...initialRef.current, ...d } : (d != null ? d : initialRef.current));
    };
    window.addEventListener(WORKSPACE_EVENT, onWs);
    return () => window.removeEventListener(WORKSPACE_EVENT, onWs);
  }, [key]);
  const clear = () => clearFormDraft(key);
  return [state, setState, clear];
}
