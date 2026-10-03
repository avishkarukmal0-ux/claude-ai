import React from 'react';
import { ArrowLeft, Inbox, Check, Trash2 } from 'lucide-react';
import { useSuggestions, SUGGESTION_KINDS } from '../../lib/suggestionsStore';

const KIND_STYLE = {
  stock: 'bg-primary-50 text-primary',
  markdown: 'bg-warning-light text-warning-dark',
  problem: 'bg-danger-light text-danger-dark',
  note: 'bg-gray-100 text-gray-500',
};

// Owner's inbox for staff suggestions (stock this / mark down / problem / note).
export default function SuggestionsInbox({ onBack }) {
  const { items, toggleDone, remove, clearDone, openCount } = useSuggestions();
  const doneCount = items.length - openCount;

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">From the team</h2>
          <p className="text-xs text-gray-400">{openCount} open{doneCount > 0 ? ` · ${doneCount} done` : ''}</p>
        </div>
        {doneCount > 0 && (
          <button type="button" onClick={clearDone} className="text-xs font-medium text-primary hover:underline">Clear done</button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
            <Inbox className="h-7 w-7" strokeWidth={1.75} />
          </span>
          <p className="text-sm font-semibold text-gray-900">Nothing from the team yet</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Staff flags (from the Staff view) land here — “stock this”, “mark down”, notes.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((s) => (
            <li key={s.id} className={`flex items-center gap-3 rounded-2xl border border-gray-100 p-3 shadow-sm ${s.done ? 'bg-gray-50' : 'bg-white'}`}>
              <button type="button" onClick={() => toggleDone(s.id)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${s.done ? 'border-success bg-success text-white' : 'border-gray-300 text-transparent'}`}
                aria-label={s.done ? 'Mark not done' : 'Mark done'}>
                <Check className="h-4 w-4" strokeWidth={3} />
              </button>
              <span className="min-w-0 flex-1">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND_STYLE[s.kind] || KIND_STYLE.note}`}>{SUGGESTION_KINDS[s.kind]?.label || 'Note'}</span>
                <span className={`mt-0.5 block text-sm font-medium ${s.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {s.productName || s.text}
                </span>
                {s.productName && s.text && <span className="block text-[11px] text-gray-500">{s.text}</span>}
              </span>
              <button type="button" onClick={() => remove(s.id)} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
