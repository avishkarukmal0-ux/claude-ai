// Device save status (Phase 1.1a/1.1b) — a clear, honest "is my work saved on this phone?" signal.
//
// The app is local-first: every change is written straight to the device (storage.js), and that write
// already reports success/failure and fires events. This module turns those events into a small piece of
// UI state so the shop floor can SEE "Saved on this phone" — and, crucially, a persistent "couldn't save"
// state when the device rejects a write (e.g. out of space), instead of only a transient toast.
//
// This is the status that matters in the accounts-off pilot (no sync). When a shop is signed in, the
// cross-device sync status (sync.js / SyncStatus) sits alongside it.
import { useEffect, useState } from 'react';
import { STORAGE_WRITE_EVENT, STORAGE_ERROR_EVENT } from './storage';

const SAVE_EVENT = 'vendora:savestatus';
const state = { lastWriteAt: 0, failed: [] }; // failed: [{ name, error }]

function emit() {
  try { window.dispatchEvent(new CustomEvent(SAVE_EVENT, { detail: snapshot() })); } catch { /* non-browser */ }
}
function snapshot() { return { lastWriteAt: state.lastWriteAt, failed: state.failed.map((f) => ({ ...f })) }; }

function onWrite(e) {
  state.lastWriteAt = Date.now();
  const name = e && e.detail && e.detail.name;
  // A successful write of a store clears any earlier failure recorded for THAT store — saving works again.
  if (name) state.failed = state.failed.filter((f) => f.name !== name);
  emit();
}
function onError(e) {
  const name = (e && e.detail && e.detail.name) || 'data';
  const error = (e && e.detail && e.detail.error) || 'Couldn’t save to this device.';
  state.failed = [...state.failed.filter((f) => f.name !== name), { name, error }];
  emit();
}

// Wire once at module load so the status is correct no matter which screen is mounted (the listeners are
// cheap and idempotent). Guarded for non-browser test envs that import this without a full DOM.
try {
  window.addEventListener(STORAGE_WRITE_EVENT, onWrite);
  window.addEventListener(STORAGE_ERROR_EVENT, onError);
} catch { /* non-browser */ }

export function getSaveStatus() { return snapshot(); }

export function useSaveStatus() {
  const [s, setS] = useState(getSaveStatus);
  useEffect(() => {
    const on = () => setS(getSaveStatus());
    window.addEventListener(SAVE_EVENT, on);
    return () => window.removeEventListener(SAVE_EVENT, on);
  }, []);
  return s;
}

/** Test hook. */
export function __resetSaveStatusForTest() { state.lastWriteAt = 0; state.failed = []; }
