import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { loadFormDraft, saveFormDraft, clearFormDraft, useFormDraft } from '../formDraft';
import { setActiveWorkspace, __resetMemForTest } from '../storage';

beforeEach(() => { try { localStorage.clear(); } catch { /* ignore */ } __resetMemForTest(); setActiveWorkspace('shop:A'); });

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

  it('F5: a mounted form RESETS on a workspace switch — shop A typing never carries into shop B', () => {
    setActiveWorkspace('shop:A');
    const { result } = renderHook(() => useFormDraft('fx', { name: '', cost: '' }));
    act(() => result.current[1]((s) => ({ ...s, name: 'SECRET A', cost: '9.99' })));
    expect(result.current[0]).toEqual({ name: 'SECRET A', cost: '9.99' });

    // Switch shops while the form is still mounted (dispatches WORKSPACE_EVENT).
    act(() => { setActiveWorkspace('shop:B'); });
    expect(result.current[0]).toEqual({ name: '', cost: '' });        // reset to shop B (no A data)
    expect(loadFormDraft('fx', 'shop:B')).toBeNull();                 // nothing of A leaked into B's draft
    expect(loadFormDraft('fx', 'shop:A')).toEqual({ name: 'SECRET A', cost: '9.99' }); // A's draft stays under A
  });
});
