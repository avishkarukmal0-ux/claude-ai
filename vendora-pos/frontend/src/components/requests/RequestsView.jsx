import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, MessageSquarePlus, Plus, Check, X, ShoppingCart, Trash2 } from 'lucide-react';
import { useRequests, sortRequests } from '../../lib/requestStore';
import { useBuyList } from '../../lib/buyListStore';

// Customer requests — log "do you sell…?" so repeat demand is visible when deciding what to stock.
export default function RequestsView({ onBack }) {
  const { requests, addRequest, setStatus, removeRequest } = useRequests();
  const { addItem, hasProduct } = useBuyList();
  const [form, setForm] = useState({ name: '', note: '' });

  const sorted = useMemo(() => sortRequests(requests), [requests]);
  const active = sorted.filter((r) => r.status === 'open' || r.status === 'planned');
  const closed = sorted.filter((r) => r.status === 'stocked' || r.status === 'declined');

  function add() {
    if (!form.name.trim()) { toast.error('What did they ask for?'); return; }
    const r = addRequest(form);
    if (r && r.count > 1) toast(`Asked ${r.count}× now`, { icon: '🔁' });
    else toast.success('Request logged');
    setForm({ name: '', note: '' });
  }

  // Add to the buy list and mark PLANNED — not "stocked". It only becomes stocked once it's actually in
  // (the owner confirms it), so waiting demand isn't prematurely closed (audit W15).
  function toBuyList(r) {
    addItem({ name: r.name, barcode: r.barcode, qty: 1 });
    setStatus(r.id, 'planned');
    toast.success('Added to buy list');
  }

  function Card({ r }) {
    const terminal = r.status === 'stocked' || r.status === 'declined';
    return (
      <li className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-primary-50 px-2 text-sm font-bold tabular-nums text-primary">{r.count}×</span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-semibold ${terminal ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{r.name}</span>
          {r.note && <span className="block truncate text-[11px] text-gray-500">{r.note}</span>}
          <span className="block text-[10px] text-gray-400">last asked {new Date(r.lastAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
        </span>
        {r.status === 'open' && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => toBuyList(r)} className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-semibold text-white active:scale-95"><ShoppingCart className="h-3.5 w-3.5" /> Add to list</button>
            <button type="button" onClick={() => setStatus(r.id, 'declined')} className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-500 active:scale-95" aria-label="Won’t stock"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
        {r.status === 'planned' && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary">On buy list</span>
            <button type="button" onClick={() => setStatus(r.id, 'stocked')} className="flex items-center gap-1 rounded-lg bg-success px-2.5 py-1.5 text-[11px] font-semibold text-white active:scale-95"><Check className="h-3.5 w-3.5" /> Got it in</button>
          </div>
        )}
        {terminal && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[11px] font-semibold text-gray-400">{r.status === 'stocked' ? 'Stocked' : 'Declined'}</span>
            <button type="button" onClick={() => removeRequest(r.id)} className="p-1 text-gray-300 hover:text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        )}
      </li>
    );
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">Customer requests</h2>
      <p className="mb-4 text-xs text-gray-400">Log what customers ask for. The more a line is asked for, the higher it climbs.</p>

      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="What did they ask for? (e.g. oat milk)" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <div className="flex gap-2">
          <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="Note (optional)" className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
          <button type="button" onClick={add} className="flex shrink-0 items-center gap-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white active:scale-95"><Plus className="h-4 w-4" /> Log</button>
        </div>
      </div>

      {active.length === 0 && closed.length === 0 ? (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><MessageSquarePlus className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">No requests logged</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Next time a customer asks for something you don’t stock, log it here.</p>
        </div>
      ) : (
        <>
          {active.length > 0 && <ul className="mb-5 space-y-2">{active.map((r) => <Card key={r.id} r={r} />)}</ul>}
          {closed.length > 0 && (
            <>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Handled</h3>
              <ul className="space-y-2">{closed.map((r) => <Card key={r.id} r={r} />)}</ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
