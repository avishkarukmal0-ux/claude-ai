import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { setActiveWorkspace, __resetMemForTest } from '../storage';
import { useTemperatureLog, readingSafe } from '../temperatureLog';
import { useRefusalsLog } from '../refusalsLog';

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
});
