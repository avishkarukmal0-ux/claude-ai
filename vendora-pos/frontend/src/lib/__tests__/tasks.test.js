import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useTasks, nextTaskStates, isException, isOverdue, exceptionCount, sortTasks,
} from '../taskStore';
import { getChecklist } from '../../config/checklists';
import { setActiveWorkspace } from '../storage';

let ws = 0;
beforeEach(() => { setActiveWorkspace(`shop:tk${ws++}`); });
const DAY = 86400000;

describe('taskStore — lifecycle & audit trail', () => {
  it('moves open→in_progress→completed→acknowledged with an audit entry each time', () => {
    const { result } = renderHook(() => useTasks());
    let id;
    act(() => { id = result.current.createTask({ title: 'Face up shelves' }, 'staff').id; });
    act(() => { result.current.setStatus(id, 'in_progress', 'staff'); });
    act(() => { result.current.setStatus(id, 'completed', 'staff'); });
    act(() => { result.current.setStatus(id, 'acknowledged', 'owner'); });
    const t = result.current.tasks.find((x) => x.id === id);
    expect(t.status).toBe('acknowledged');
    expect(t.history.map((h) => h.action)).toEqual(['created', 'in_progress', 'completed', 'acknowledged']);
    expect(t.history[3].by).toBe('owner');
  });

  it('ignores illegal transitions', () => {
    const { result } = renderHook(() => useTasks());
    let id;
    act(() => { id = result.current.createTask({ title: 'X' }).id; });
    act(() => { result.current.setStatus(id, 'acknowledged'); }); // open can't jump to acknowledged
    expect(result.current.tasks.find((x) => x.id === id).status).toBe('open');
    expect(nextTaskStates('open')).toEqual(['in_progress', 'completed']);
    expect(nextTaskStates('acknowledged')).toEqual([]);
  });
});

describe('taskStore — exceptions (owner sees these, not every action)', () => {
  it('flags overdue and high-priority open tasks only', () => {
    const now = Date.now();
    const overdue = { status: 'open', priority: 'normal', dueAt: now - DAY };
    const high = { status: 'in_progress', priority: 'high', dueAt: null };
    const normalOpen = { status: 'open', priority: 'normal', dueAt: now + DAY };
    const doneHigh = { status: 'completed', priority: 'high', dueAt: now - DAY };
    expect(isOverdue(overdue, now)).toBe(true);
    expect(isException(overdue, now)).toBe(true);
    expect(isException(high, now)).toBe(true);
    expect(isException(normalOpen, now)).toBe(false);
    expect(isException(doneHigh, now)).toBe(false); // completed → not an exception
    expect(exceptionCount([overdue, high, normalOpen, doneHigh], now)).toBe(2);
  });

  it('sorts exceptions first', () => {
    const now = Date.now();
    const list = [
      { id: 'a', status: 'open', priority: 'normal', dueAt: now + DAY, createdAt: 3 },
      { id: 'b', status: 'open', priority: 'high', dueAt: null, createdAt: 2 },
    ];
    expect(sortTasks(list, now)[0].id).toBe('b');
  });
});

describe('taskStore — checklists & handover', () => {
  it('applies a checklist template as open tasks', () => {
    const { result } = renderHook(() => useTasks());
    const tpl = getChecklist('opening');
    let n;
    act(() => { n = result.current.applyChecklist(tpl, 'staff'); });
    expect(n).toBe(tpl.items.length);
    expect(result.current.tasks.filter((t) => t.category === 'opening').length).toBe(tpl.items.length);
  });

  it('handover stamps unresolved tasks and logs a note', () => {
    const { result } = renderHook(() => useTasks());
    act(() => { result.current.createTask({ title: 'Restock milk' }, 'staff'); });
    act(() => { const d = result.current.createTask({ title: 'Done job' }, 'staff'); result.current.setStatus(d.id, 'completed', 'staff'); });
    let entry;
    act(() => { entry = result.current.handover({ by: 'staff', note: 'fridge 3 warm' }); });
    expect(entry.taskCount).toBe(1); // only the unresolved one
    expect(result.current.handovers[0].note).toBe('fridge 3 warm');
    expect(result.current.tasks.find((t) => t.title === 'Restock milk').handedOver).toBe(true);
  });
});
