import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { loadFormDraft, saveFormDraft, clearFormDraft, useFormDraft } from '../formDraft';

beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

describe('formDraft (Phase 3.9f) — preserve unsaved form input across navigation', () => {
  it('save / load / clear round-trips', () => {
    expect(loadFormDraft('k')).toBeNull();
    saveFormDraft('k', { a: 1 });
    expect(loadFormDraft('k')).toEqual({ a: 1 });
    clearFormDraft('k');
    expect(loadFormDraft('k')).toBeNull();
  });

  it('useFormDraft restores a saved draft (merged over initial) after a remount, and clear() wipes it', () => {
    const { result, unmount } = renderHook(() => useFormDraft('f1', { name: '', qty: '' }));
    act(() => result.current[1]((s) => ({ ...s, name: 'Milk' })));
    unmount(); // simulate navigating away (component unmounts)

    // Remount with an initial that gained a new field — the draft should merge over it.
    const second = renderHook(() => useFormDraft('f1', { name: '', qty: '', extra: 'def' }));
    expect(second.result.current[0]).toEqual({ name: 'Milk', qty: '', extra: 'def' });

    act(() => second.result.current[2]()); // clear()
    const third = renderHook(() => useFormDraft('f1', { name: '' }));
    expect(third.result.current[0]).toEqual({ name: '' });
  });
});
