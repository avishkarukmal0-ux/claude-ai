// Staff tasks & shift handover — a shared to-do for the shop floor. Scoped to the active
// workspace. Local-first: every important change is stamped into the task's audit trail. Owners
// see EXCEPTIONS (high-priority / overdue), not a stream of every action.
//
// NOTE (infra): scheduled reminders that reach the owner while the app is closed need a server
// job + push — not built here (see ADR-002). The fallback the spec requires is honoured: important
// issues stay visible IN THE APP (exceptions surface on Home via the action engine).
import { useCallback, useEffect, useState } from 'react';
import { readJSON, writeJSON } from './storage';

const NAME = 'tasks_v1';
const H_KEY = 'handovers_v1';

export const TASK_STATUSES = ['open', 'in_progress', 'completed', 'acknowledged'];
export const OPEN_TASK_STATUSES = ['open', 'in_progress'];
export const PRIORITIES = ['low', 'normal', 'high'];
export const TASK_CATEGORIES = ['general', 'opening', 'closing', 'stock', 'cleaning', 'admin'];

function load() { const a = readJSON(NAME, []); return Array.isArray(a) ? a : []; }
function persist(list) { return writeJSON(NAME, list); }
function loadHandovers() { const a = readJSON(H_KEY, []); return Array.isArray(a) ? a : []; }
function persistHandovers(list) { return writeJSON(H_KEY, list); }
function newId(p = 't') {
  try { if (crypto?.randomUUID) return `${p}_${crypto.randomUUID()}`; } catch { /* ignore */ }
  return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---- pure helpers (unit-tested) -------------------------------------------
/** Allowed forward/again transitions. */
export function nextTaskStates(status) {
  switch (status) {
    case 'open': return ['in_progress', 'completed'];
    case 'in_progress': return ['completed'];
    case 'completed': return ['acknowledged', 'open']; // owner acks, or reopen
    default: return []; // acknowledged is terminal
  }
}

export function isOverdue(task, now = Date.now()) {
  return !!task.dueAt && task.dueAt < now && OPEN_TASK_STATUSES.includes(task.status);
}

/** An exception = still-open work that needs attention: high priority OR overdue. */
export function isException(task, now = Date.now()) {
  return OPEN_TASK_STATUSES.includes(task.status) && (task.priority === 'high' || isOverdue(task, now));
}

const PRI_RANK = { high: 0, normal: 1, low: 2 };
/** Exceptions first, then priority, then soonest due, then newest. */
export function sortTasks(tasks, now = Date.now()) {
  return [...tasks].sort((a, b) => {
    const ex = (isException(b, now) ? 1 : 0) - (isException(a, now) ? 1 : 0);
    if (ex) return ex;
    const pr = (PRI_RANK[a.priority] ?? 1) - (PRI_RANK[b.priority] ?? 1);
    if (pr) return pr;
    const ad = a.dueAt || Infinity; const bd = b.dueAt || Infinity;
    if (ad !== bd) return ad - bd;
    return b.createdAt - a.createdAt;
  });
}

export function exceptionCount(tasks, now = Date.now()) {
  return tasks.filter((t) => isException(t, now)).length;
}
export function openTaskCount(tasks) {
  return tasks.filter((t) => OPEN_TASK_STATUSES.includes(t.status)).length;
}

function stamp(task, action, by, note) {
  return { ...task, history: [...(task.history || []), { action, at: Date.now(), by: by || null, ...(note ? { note } : {}) }] };
}

// ---- hook -----------------------------------------------------------------
export function useTasks() {
  const [tasks, setTasks] = useState(load);
  const [handovers, setHandovers] = useState(loadHandovers);

  useEffect(() => {
    const refresh = () => { setTasks(load()); setHandovers(loadHandovers()); };
    window.addEventListener('storage', refresh);
    window.addEventListener('vendora:workspace', refresh);
    window.addEventListener('vendora:tasks', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('vendora:workspace', refresh);
      window.removeEventListener('vendora:tasks', refresh);
    };
  }, []);

  const commit = (next) => { persist(next); setTasks(next); try { window.dispatchEvent(new CustomEvent('vendora:tasks')); } catch { /* ignore */ } };

  const createTask = useCallback((t, by) => {
    const task = stamp({
      id: newId(),
      title: (t.title || '').trim() || 'Task',
      category: TASK_CATEGORIES.includes(t.category) ? t.category : 'general',
      priority: PRIORITIES.includes(t.priority) ? t.priority : 'normal',
      assignee: (t.assignee || '').trim(),
      dueAt: t.dueAt || null,
      productId: t.productId || null, productName: t.productName || '',
      location: t.location || '', note: (t.note || '').trim(), photo: t.photo || null,
      status: 'open', createdAt: Date.now(), createdBy: by || null, handedOver: false, history: [],
    }, 'created', by);
    commit([task, ...load()]);
    return task;
  }, []);

  const updateTask = useCallback((id, patch) => {
    commit(load().map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  /** Change status with audit trail; enforces the state machine. */
  const setStatus = useCallback((id, status, by, note) => {
    commit(load().map((t) => {
      if (t.id !== id) return t;
      if (!nextTaskStates(t.status).includes(status)) return t;
      return stamp({ ...t, status }, status, by, note);
    }));
  }, []);

  const removeTask = useCallback((id) => { commit(load().filter((t) => t.id !== id)); }, []);

  /** Create tasks from a checklist template (opening/closing). */
  const applyChecklist = useCallback((template, by) => {
    const now = Date.now();
    const created = (template.items || []).map((title, i) => stamp({
      id: newId(), title, category: template.category || 'general', priority: 'normal',
      assignee: '', dueAt: null, productId: null, productName: '', location: '', note: '', photo: null,
      status: 'open', createdAt: now - i, createdBy: by || null, handedOver: false, history: [],
    }, 'created', by));
    commit([...created, ...load()]);
    return created.length;
  }, []);

  /** Hand over all unresolved tasks to the next shift: stamp them + log a handover note. */
  const handover = useCallback(({ by, note } = {}) => {
    const cur = load();
    const unresolved = cur.filter((t) => OPEN_TASK_STATUSES.includes(t.status));
    const next = cur.map((t) => (OPEN_TASK_STATUSES.includes(t.status) ? stamp({ ...t, handedOver: true }, 'handover', by, note) : t));
    commit(next);
    const entry = { id: newId('ho'), at: Date.now(), by: by || null, note: (note || '').trim(), taskCount: unresolved.length, titles: unresolved.map((t) => t.title) };
    const hs = [entry, ...loadHandovers()].slice(0, 50);
    persistHandovers(hs); setHandovers(hs);
    return entry;
  }, []);

  return { tasks, handovers, createTask, updateTask, setStatus, removeTask, applyChecklist, handover };
}

/** Non-hook read for Home/action-engine surfacing. */
export function getOpenExceptionCount() {
  return exceptionCount(load());
}
export function getOpenTasks() {
  return load().filter((t) => OPEN_TASK_STATUSES.includes(t.status));
}
