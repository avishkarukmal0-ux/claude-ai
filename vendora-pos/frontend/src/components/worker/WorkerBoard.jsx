import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Flag, Send, AlertTriangle } from 'lucide-react';
import { useInventory, isLowStock, expiryInfo } from '../../lib/inventoryStore';
import { useSuggestions } from '../../lib/suggestionsStore';

// Worker / staff view — what a staff member needs on shift: what's expiring,
// what's low, and a one-tap way to flag things to the owner. Local-first.
export default function WorkerBoard({ onBack }) {
  const { products } = useInventory();
  const { add } = useSuggestions();
  const [note, setNote] = useState('');

  const expiring = useMemo(
    () => products.map((p) => ({ p, info: expiryInfo(p) })).filter((x) => x.info && x.info.status !== 'ok').sort((a, b) => a.info.daysLeft - b.info.daysLeft),
    [products]
  );
  const low = useMemo(() => products.filter(isLowStock), [products]);

  function flag(kind, productName) {
    add({ kind, productName });
    toast.success('Flagged to owner');
  }
  function sendNote() {
    if (!note.trim()) return;
    add({ kind: 'note', text: note });
    setNote('');
    toast.success('Sent to owner');
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>

      <h2 className="mb-1 text-base font-bold text-gray-900">Staff view</h2>
      <p className="mb-4 text-xs text-gray-400">What needs doing on shift — and flag anything to the owner.</p>

      {/* Quick note to owner */}
      <div className="mb-5 flex gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendNote(); }}
          placeholder="Tell the owner something…" className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <button type="button" onClick={sendNote} className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white active:scale-95">
          <Send className="h-4 w-4" />
        </button>
      </div>

      {/* Expiring */}
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Expiring / expired</h3>
      {expiring.length === 0 ? (
        <p className="mb-5 text-sm text-gray-400">Nothing expiring. 👍</p>
      ) : (
        <ul className="mb-5 space-y-2">
          {expiring.map(({ p, info }) => (
            <li key={p.id} className={`flex items-center gap-3 rounded-2xl border p-3 shadow-sm ${info.mustPull ? 'border-danger/40 bg-danger-light' : 'border-gray-100 bg-white'}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-900">{p.name}</span>
                <span className={`block text-[11px] ${info.status === 'expired' ? 'text-danger' : 'text-gray-500'}`}>
                  {info.daysLeft < 0 ? `${Math.abs(info.daysLeft)}d over` : `in ${info.daysLeft}d`}{info.mustPull ? ' · pull now' : ''}
                </span>
              </span>
              <button type="button" onClick={() => flag('markdown', p.name)} className="shrink-0 rounded-lg bg-warning-light px-2.5 py-1.5 text-[11px] font-semibold text-warning-dark active:scale-95">
                <Flag className="mr-1 inline h-3 w-3" />Mark down
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Low stock */}
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Running low</h3>
      {low.length === 0 ? (
        <p className="text-sm text-gray-400">Nothing low right now.</p>
      ) : (
        <ul className="space-y-2">
          {low.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-gray-900">{p.name}</span>
                <span className="block text-[11px] text-gray-500">{Number(p.qty) || 0} left</span>
              </span>
              <button type="button" onClick={() => flag('stock', p.name)} className="shrink-0 rounded-lg bg-primary-50 px-2.5 py-1.5 text-[11px] font-semibold text-primary active:scale-95">
                <Flag className="mr-1 inline h-3 w-3" />Stock this
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
