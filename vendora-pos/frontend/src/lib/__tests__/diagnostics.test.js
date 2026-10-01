import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordFailure, getDiagnostics, clearDiagnostics, makeReference, __resetDiagnosticsForTest,
} from '../diagnostics';
import { STORAGE_ERROR_EVENT } from '../storage';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetDiagnosticsForTest();
  clearDiagnostics();
});

describe('diagnostics (Phase 3.10)', () => {
  it('records failures as counts + a newest-first event log of non-sensitive metadata', () => {
    recordFailure('ocr', 'HTTP 500');
    recordFailure('save', 'quota exceeded');
    const d = getDiagnostics();
    expect(d.counts.ocr).toBe(1);
    expect(d.counts.save).toBe(1);
    expect(d.events[0]).toMatchObject({ kind: 'save', code: 'quota exceeded' });
    expect(typeof d.events[0].at).toBe('number');
    expect(d.version).toBeTruthy();
  });

  it('captures a save failure from the storage error event (self-wired)', () => {
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { error: 'no space on device' } }));
    expect(getDiagnostics().counts.save).toBeGreaterThanOrEqual(1);
  });

  it('mints a support reference like VEN-YYYYMMDD-XXXX', () => {
    expect(makeReference()).toMatch(/^VEN-\d{8}-[A-Z0-9]{4}$/);
  });

  it('clearDiagnostics resets counts + events', () => {
    recordFailure('sync', 'offline');
    clearDiagnostics();
    expect(getDiagnostics().counts).toEqual({});
    expect(getDiagnostics().events).toEqual([]);
  });
});
