import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { setActiveWorkspace, __resetMemForTest } from '../storage';
import { useTemperatureLog, readingSafe, temperatureCsv } from '../temperatureLog';
import { useScaleChecks } from '../scaleChecks';
import { useRefusalsLog, refusalsCsv } from '../refusalsLog';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
  __resetMemForTest();
  setActiveWorkspace('shop:logs');
});

describe('temperatureLog — safe-range flagging', () => {
  it('flags chilled over 8°C and frozen over −18°C', () => {
    expect(readingSafe('chilled', 4)).toBe(true);
    expect(readingSafe('chilled', 9)).toBe(false);
    expect(readingSafe('frozen', -20)).toBe(true);
    expect(readingSafe('frozen', -10)).toBe(false);
  });

  it('records a reading with its safe flag; rejects a non-number', () => {
    const { result } = renderHook(() => useTemperatureLog());
    act(() => { result.current.addReading({ unit: 'Deli fridge', kind: 'chilled', tempC: 11 }); });
    expect(result.current.readings[0].safe).toBe(false);
    let bad;
    act(() => { bad = result.current.addReading({ kind: 'chilled', tempC: '' }); });
    expect(bad.ok).toBe(false);
  });

  it('flags hot-hold below 63°C and keeps a corrective action; CSV has a header + rows', () => {
    expect(readingSafe('hothold', 70)).toBe(true);
    expect(readingSafe('hothold', 55)).toBe(false);
    const { result } = renderHook(() => useTemperatureLog());
    act(() => { result.current.addReading({ unit: 'Pie warmer', kind: 'hothold', tempC: 55, action: 'reheated' }); });
    expect(result.current.readings[0].safe).toBe(false);
    expect(result.current.readings[0].action).toBe('reheated');
    const csv = temperatureCsv(result.current.readings);
    expect(csv.split('\n')[0]).toMatch(/Date.*Type.*Action/);
  });
});

describe('scaleChecks — verified + self-check records', () => {
  it('records a verified mark and a self-check, surfacing the latest of each', () => {
    const { result } = renderHook(() => useScaleChecks());
    act(() => { result.current.recordCheck({ kind: 'verified' }); });
    act(() => { result.current.recordCheck({ kind: 'selfcheck' }); });
    expect(result.current.lastVerified).toBeTruthy();
    expect(result.current.lastSelfCheck).toBeTruthy();
    let bad;
    act(() => { bad = result.current.recordCheck({ kind: 'nope' }); });
    expect(bad.ok).toBe(false);
  });
});

describe('refusalsLog — record a refused sale', () => {
  it('logs a refusal and rejects an unknown reason', () => {
    const { result } = renderHook(() => useRefusalsLog());
    act(() => { result.current.addRefusal({ reason: 'underage', product: 'Vodka' }); });
    expect(result.current.refusals).toHaveLength(1);
    expect(result.current.refusals[0].reason).toBe('underage');
    let bad;
    act(() => { bad = result.current.addRefusal({ reason: 'nope' }); });
    expect(bad.ok).toBe(false);
  });

  it('records a manager sign-off and exports CSV with a header + a row', () => {
    const { result } = renderHook(() => useRefusalsLog());
    act(() => { result.current.addRefusal({ reason: 'no-id', product: 'Cider', initials: 'js' }); });
    act(() => { result.current.signOff('MG'); });
    expect(result.current.signoffs[0].initials).toBe('MG');
    expect(result.current.refusals[0].initials).toBe('JS'); // upper-cased
    const csv = refusalsCsv(result.current.refusals);
    expect(csv.split('\n')[0]).toMatch(/Date.*Reason.*Staff/);
    expect(csv).toMatch(/Cider/);
  });
});
