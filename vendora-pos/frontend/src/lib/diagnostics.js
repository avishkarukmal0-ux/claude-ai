// Lightweight operational diagnostics (Phase 3.10) — a device-local tally of failures so the owner (and,
// via a copyable report, an operator) can see that something's going wrong, instead of failures vanishing
// after a toast. Stores ONLY non-sensitive metadata: a failure kind, a short reason/code, and a timestamp.
// It NEVER records shop data, documents, invoice contents, customer info, or credentials — and nothing is
// ever transmitted automatically (the problem-report flow is copy-to-send only).
import { useEffect, useState } from 'react';
import { STORAGE_ERROR_EVENT } from './storage';
import { SYNC_EVENT } from './sync';

const KEY = 'vendora:diagnostics';           // device-local, not a synced store
const CHANGE_EVENT = 'vendora:diagnostics-change';
const MAX_EVENTS = 20;
const KINDS = ['save', 'sync', 'ocr', 'reminder', 'other'];

function fresh() { return { counts: {}, events: [] }; }
function load() {
  try { const r = localStorage.getItem(KEY); const d = r ? JSON.parse(r) : null; return d && typeof d === 'object' && d.counts ? d : fresh(); }
  catch { return fresh(); }
}
function persist(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(CHANGE_EVENT)); } catch { /* non-browser */ }
}

export function appVersion() {
  try { return import.meta.env.VITE_APP_VERSION || '3.0.0'; } catch { return '3.0.0'; }
}

/** Record a failure. `kind` ∈ save|sync|ocr|reminder; `reason` is a SHORT non-sensitive code/message. */
export function recordFailure(kind, reason) {
  const k = KINDS.includes(kind) ? kind : 'other';
  const d = load();
  d.counts[k] = (d.counts[k] || 0) + 1;
  d.events.unshift({ kind: k, code: reason ? String(reason).slice(0, 80) : null, at: Date.now() });
  d.events = d.events.slice(0, MAX_EVENTS);
  persist(d);
  return d;
}

export function getDiagnostics() {
  const d = load();
  return { version: appVersion(), counts: { ...d.counts }, events: d.events.map((e) => ({ ...e })) };
}
export function clearDiagnostics() { persist(fresh()); }

/** A support reference number for a problem report: VEN-YYYYMMDD-XXXX (local, no PII). */
export function makeReference(now = new Date()) {
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VEN-${ymd}-${rand}`;
}

// Self-wire to the events the app already emits, so failures are captured without each caller opting in.
// Save: one per failed write. Sync: only on the transition INTO an error state (avoid double-counting the
// repeated SYNC_EVENT ticks).
let wired = false;
let lastSyncStatus = null;
function ensureWired() {
  if (wired) return;
  wired = true;
  try {
    window.addEventListener(STORAGE_ERROR_EVENT, (e) => recordFailure('save', e && e.detail && e.detail.error));
    window.addEventListener(SYNC_EVENT, (e) => {
      const s = e && e.detail;
      if (!s) return;
      if (s.status === 'error' && lastSyncStatus !== 'error') recordFailure('sync', s.error);
      lastSyncStatus = s.status;
    });
  } catch { /* non-browser */ }
}
ensureWired();

export function useDiagnostics() {
  const [d, setD] = useState(getDiagnostics);
  useEffect(() => {
    const on = () => setD(getDiagnostics());
    window.addEventListener(CHANGE_EVENT, on);
    return () => window.removeEventListener(CHANGE_EVENT, on);
  }, []);
  return d;
}

/** Test hook. */
export function __resetDiagnosticsForTest() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } lastSyncStatus = null; }
