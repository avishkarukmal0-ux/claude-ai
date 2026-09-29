import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Search, PackageOpen, ArrowRightLeft, Store, Warehouse, Plus, Minus } from 'lucide-react';
import {
  useInventory, shelfTracked, shelfQtyOf, backQtyOf, needsRefill,
} from '../../lib/inventoryStore';

// Stage 3 — shelf refill & simple locations. Total shop stock never changes here; only the
// split between the shop floor (shelf) and the back room. An empty shelf with back-room stock is
// a REFILL task — never an automatic purchase requirement.
export default function RefillView({ onBack }) {
  const { products, transferStock, setShelfQty } = useInventory();
  const [query, setQuery] = useState('');

  const refills = useMemo(() => products.filter(needsRefill), [products]);

  const tracked = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => shelfTracked(p))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q));
  }, [products, query]);

  const untracked = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => !shelfTracked(p) && (p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q)));
  }, [products, query]);

  function refillAll(p) {
    const back = backQtyOf(p) || 0;
    const res = transferStock(p.id, back, 'to_shelf');
    if (res.ok) toast.success(`Moved ${res.applied} × ${p.name} to the shelf`);
    else toast.error(res.error || 'Couldn’t refill');
  }

  return (
    <div>
      <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> Home
      </button>
      <h2 className="mb-1 text-base font-bold text-gray-900">Shelf &amp; refill</h2>
      <p className="mb-4 text-xs text-gray-400">Move stock from the back room to the shelf. Total stock stays the same — this isn’t a reorder.</p>

      {/* Needs refilling */}
      {refills.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <PackageOpen className="h-3.5 w-3.5" /> Shelf empty · stock out back
          </h3>
          <ul className="space-y-2">
            {refills.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-3 shadow-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{p.name}</span>
                  <span className="block text-[11px] text-gray-500">Shelf 0 · {backQtyOf(p)} out back</span>
                </span>
                <button type="button" onClick={() => refillAll(p)} className="flex shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white active:scale-95">
                  <ArrowRightLeft className="h-4 w-4" /> Refill
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
      </div>

      {/* Tracked locations */}
      {tracked.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Shelf / back room</h3>
          <ul className="space-y-2">
            {tracked.map((p) => {
              const shelf = shelfQtyOf(p); const back = backQtyOf(p);
              return (
                <li key={p.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="min-w-0 truncate text-sm font-semibold text-gray-900">{p.name}</span>
                    <span className="shrink-0 text-[11px] text-gray-400">total {Number(p.qty) || 0}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1 rounded-lg bg-primary-50 px-2 py-1 font-semibold text-primary"><Store className="h-3.5 w-3.5" /> Shelf {shelf}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => transferStock(p.id, 1, 'to_back')} className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-600 active:scale-95" aria-label="Move one to back"><Minus className="h-3.5 w-3.5" /></button>
                      <ArrowRightLeft className="h-3.5 w-3.5 text-gray-300" />
                      <button type="button" onClick={() => transferStock(p.id, 1, 'to_shelf')} className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary active:scale-95" aria-label="Move one to shelf"><Plus className="h-3.5 w-3.5" /></button>
                    </div>
                    <span className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 font-semibold text-gray-600"><Warehouse className="h-3.5 w-3.5" /> Back {back}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Start tracking (only when searching) */}
      {untracked.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Start tracking a location</h3>
          <ul className="space-y-2">
            {untracked.slice(0, 8).map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">{p.name}</span>
                  <span className="block text-[11px] text-gray-400">{Number(p.qty) || 0} in stock · location not tracked</span>
                </span>
                <button type="button" onClick={() => { setShelfQty(p.id, Number(p.qty) || 0); toast.success('Now tracking shelf/back for this item'); }} className="shrink-0 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700 active:scale-95">
                  Track shelf
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {refills.length === 0 && tracked.length === 0 && untracked.length === 0 && (
        <div className="mt-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary"><Warehouse className="h-7 w-7" strokeWidth={1.75} /></span>
          <p className="text-sm font-semibold text-gray-900">Locations are optional</p>
          <p className="mt-1 max-w-xs text-sm text-gray-500">Search a product and tap “Track shelf” to split its stock between the shop floor and back room. Then refills show up here.</p>
        </div>
      )}
    </div>
  );
}
