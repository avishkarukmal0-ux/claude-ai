import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Plus, Check, Play, Undo2, Trash2, AlertTriangle, ClipboardList,
  ListChecks, UserRound, Clock, ChevronDown, ShieldCheck,
} from 'lucide-react';
import {
  useTasks, nextTaskStates, isException, isOverdue, sortTasks, exceptionCount, PRIORITIES, TASK_CATEGORIES,
} from '../../lib/taskStore';
import { CHECKLIST_TEMPLATES } from '../../config/checklists';

const ACTION_LABEL = { in_progress: 'Start', completed: 'Complete', acknowledged: 'Acknowledge', open: 'Reopen' };
const ACTION_ICON = { in_progress: Play, completed: Check, acknowledged: ShieldCheck, open: Undo2 };
const STATUS_CHIP = {
  open: 'bg-gray-100 text-gray-500', in_progress: 'bg-primary-50 text-primary',
  completed: 'bg-success-light text-success-dark', acknowledged: 'bg-success-light text-success-dark',
};
const PRI_CHIP = { high: 'bg-danger/10 text-danger', normal: 'bg-gray-100 text-gray-500', low: 'bg-gray-100 text-gray-400' };
const dateLabel = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function loadRole() { try { return localStorage.getItem('vendora:role') || 'owner'; } catch { return 'owner'; } }

// Stage 6 — staff tasks & shift handover. Owner/staff role gates owner-only actions (full role
// enforcement needs backend auth). Owners see exceptions first, not every action.
export default function TasksView({ onBack }) {
  const { tasks, handovers, createTask, setStatus, removeTask, applyChecklist, handover } = useTasks();
  const [role, setRole] = useState(loadRole);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'general', priority: 'normal', assignee: '', due: '', note: '' });
  const [handNote, setHandNote] = useState('');

  const now = Date.now();
  const sorted = useMemo(() => sortTasks(tasks, now), [tasks]);
  const exceptions = exceptionCount(tasks, now);
  const unresolved = tasks.filter((t) => t.status === 'open' || t.status === 'in_progress');

  function switchRole(r) { setRole(r); try { localStorage.setItem('vendora:role', r); } catch { /* ignore */ } }

  function add() {
    if (!form.title.trim()) { toast.error('Give the task a title'); return; }
    createTask({ ...form, dueAt: form.due ? new Date(form.due).getTime() : null }, role);
    setForm({ title: '', category: 'general', priority: 'normal', assignee: '', due: '', note: '' });
    setAdding(false);
  }

  function doHandover() {
    if (unresolved.length === 0) { toast('Nothing unresolved to hand over'); return; }
    const e = handover({ by: role, note: handNote });
    setHandNote('');
    toast.success(`Handed over ${e.taskCount} task${e.taskCount === 1 ? '' : 's'}`);
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-900">Team tasks</h2>
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-[11px]">
          {['owner', 'staff'].map((r) => (
            <button key={r} type="button" onClick={() => switchRole(r)} className={`px-2.5 py-1 font-semibold capitalize ${role === r ? 'bg-primary text-white' : 'bg-white text-gray-500'}`}>{r}</button>
          ))}
        </div>
      </div>

      {exceptions > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-danger/30 bg-danger-light/50 p-3 text-sm font-semibold text-danger-dark">
          <AlertTriangle className="h-4 w-4" /> {exceptions} task{exceptions === 1 ? '' : 's'} need attention (overdue or high priority)
        </div>
      )}

      {/* Checklists */}
      <div className="mb-3 flex gap-2">
        {CHECKLIST_TEMPLATES.map((c) => (
          <button key={c.id} type="button" onClick={() => { const n = applyChecklist(c, role); toast.success(`Added ${n} ${c.label.toLowerCase()} tasks`); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 active:scale-[0.99]">
            <ListChecks className="h-4 w-4" /> {c.label}
          </button>
        ))}
      </div>

      {/* Add task */}
      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="mb-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-white active:scale-[0.99]">
          <Plus className="h-4 w-4" /> New task
        </button>
      ) : (
        <div className="mb-4 space-y-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="What needs doing?" className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="rounded-xl border border-gray-200 px-2 py-2 text-sm capitalize focus:border-primary focus:outline-none">
              {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="rounded-xl border border-gray-200 px-2 py-2 text-sm capitalize focus:border-primary focus:outline-none">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p} priority</option>)}
            </select>
            <input value={form.assignee} onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))} placeholder="Assign to (optional)" className="rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            <input type="date" value={form.due} onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))} className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setAdding(false)} className="rounded-xl bg-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-600">Cancel</button>
            <button type="button" onClick={add} className="rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white">Add task</button>
          </div>
        </div>
      )}

      {/* Task list */}
      {sorted.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><ClipboardList className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">No tasks yet</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Add a task or start an opening/closing checklist.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((t) => {
            const overdue = isOverdue(t, now);
            const ex = isException(t, now);
            const transitions = nextTaskStates(t.status).filter((s) => (s === 'acknowledged' ? role === 'owner' : true));
            const last = (t.history || [])[t.history.length - 1];
            return (
              <li key={t.id} className={`rounded-2xl border p-3 shadow-sm ${ex ? 'border-danger/30 bg-danger-light/30' : 'border-gray-100 bg-white'}`}>
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold ${t.status === 'completed' || t.status === 'acknowledged' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{t.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className={`rounded-full px-1.5 py-0.5 font-semibold ${STATUS_CHIP[t.status]}`}>{t.status.replace('_', ' ')}</span>
                      {t.priority !== 'normal' && <span className={`rounded-full px-1.5 py-0.5 font-semibold ${PRI_CHIP[t.priority]}`}>{t.priority}</span>}
                      <span className="rounded-full bg-gray-100 px-1.5 py-0.5 capitalize text-gray-500">{t.category}</span>
                      {t.assignee && <span className="flex items-center gap-0.5 text-gray-500"><UserRound className="h-3 w-3" />{t.assignee}</span>}
                      {t.dueAt && <span className={`flex items-center gap-0.5 ${overdue ? 'font-semibold text-danger' : 'text-gray-500'}`}><Clock className="h-3 w-3" />{overdue ? 'overdue' : dateLabel(t.dueAt)}</span>}
                      {t.handedOver && <span className="rounded-full bg-warning-light px-1.5 py-0.5 font-semibold text-warning-dark">handed over</span>}
                    </span>
                    {last && <span className="mt-1 block text-[10px] text-gray-400">{last.action}{last.by ? ` · ${last.by}` : ''} · {dateLabel(last.at)}</span>}
                  </span>
                  <button type="button" onClick={() => removeTask(t.id)} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Delete task"><Trash2 className="h-4 w-4" /></button>
                </div>
                {transitions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {transitions.map((s) => { const Icon = ACTION_ICON[s]; return (
                      <button key={s} type="button" onClick={() => setStatus(t.id, s, role)} className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold active:scale-95 ${s === 'open' ? 'bg-gray-100 text-gray-600' : 'bg-primary text-white'}`}>
                        <Icon className="h-3.5 w-3.5" /> {ACTION_LABEL[s]}
                      </button>
                    ); })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Handover */}
      <section className="mt-6">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400"><ChevronDown className="h-3.5 w-3.5" /> Shift handover</h3>
        <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          <p className="mb-2 text-[11px] text-gray-500">{unresolved.length} unresolved task{unresolved.length === 1 ? '' : 's'} to pass on.</p>
          <input value={handNote} onChange={(e) => setHandNote(e.target.value)} placeholder="Handover note (optional)" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <button type="button" onClick={doHandover} className="w-full rounded-xl bg-gray-900 px-3 py-2.5 text-sm font-semibold text-white active:scale-[0.99]">Hand over to next shift</button>
        </div>
        {handovers.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {handovers.slice(0, 4).map((h) => (
              <li key={h.id} className="rounded-xl border border-gray-100 bg-white p-2.5 text-[11px] text-gray-500 shadow-sm">
                <span className="font-semibold text-gray-700">{dateLabel(h.at)}{h.by ? ` · ${h.by}` : ''}</span> — {h.taskCount} task(s){h.note ? ` · “${h.note}”` : ''}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
