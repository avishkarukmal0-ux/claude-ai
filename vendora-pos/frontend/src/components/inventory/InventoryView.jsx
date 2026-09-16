import React, { useMemo, useState } from 'react';
import { Plus, Search, Trash2, Minus, PackagePlus } from 'lucide-react';
import { useInventory, margin, isLowStock } from '../../lib/inventoryStore';
import { useSuppliers } from '../../lib/supplierStore';

// Stock tab — a real, on-device inventory. Add/search products, adjust stock,
// see margins and low-stock at a glance. Works offline; no backend needed.
export default function InventoryView() {
  const { products, addProduct, updateProduct, removeProduct } = useInventory();
  const { suppliers } = useSuppliers();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const supplierNameById = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s.name])), [suppliers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q)
    );
  }, [products, query]);

  const lowCount = products.filter(isLowStock).length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">Inventory</h2>
          <p className="text-xs text-gray-400">
            {products.length} item{products.length === 1 ? '' : 's'}
            {lowCount > 0 && <span className="text-danger"> · {lowCount} low</span>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm active:scale-95"
        >
          <Plus className="h-4 w-4" /> Add
        </button>
      </div>

      {adding && <AddForm suppliers={suppliers} onAdd={(p) => { addProduct(p); setAdding(false); }} onCancel={() => setAdding(false)} />}

      {products.length > 0 && (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or barcode"
            className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {products.length === 0 && !adding ? (
        <EmptyState onAdd={() => setAdding(true)} />
      ) : (
        <ul className="space-y-2">
          {filtered.map((p) => {
            const m = margin(p);
            const low = isLowStock(p);
            return (
              <li key={p.id} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-gray-900">{p.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
                      {p.barcode && <span className="font-mono">{p.barcode}</span>}
                      {Number.isFinite(p.price) && p.price != null && <span>£{Number(p.price).toFixed(2)}</span>}
                      {m != null && <span className={m < 0 ? 'text-danger' : 'text-success'}>{(m * 100).toFixed(0)}% margin</span>}
                    </div>
                    {suppliers.length > 0 && (
                      <select
                        value={p.supplierId || ''}
                        onChange={(e) => updateProduct(p.id, { supplierId: e.target.value || null })}
                        className="mt-1 max-w-[12rem] truncate rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-600 focus:border-primary focus:outline-none"
                        aria-label="Supplier"
                      >
                        <option value="">— supplier —</option>
                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    )}
                  </div>
                  <button type="button" onClick={() => removeProduct(p.id)} className="shrink-0 p-1 text-gray-300 hover:text-danger" aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${low ? 'bg-danger-light text-danger-dark' : 'bg-gray-100 text-gray-500'}`}>
                    {low ? 'Low stock' : 'In stock'}
                  </span>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => updateProduct(p.id, { qty: Math.max(0, (Number(p.qty) || 0) - 1) })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600 active:scale-95" aria-label="Decrease">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center text-base font-bold tabular-nums text-gray-900">{Number(p.qty) || 0}</span>
                    <button type="button" onClick={() => updateProduct(p.id, { qty: (Number(p.qty) || 0) + 1 })} className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-50 text-primary active:scale-95" aria-label="Increase">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function AddForm({ onAdd, onCancel, suppliers = [] }) {
  const [f, setF] = useState({ name: '', barcode: '', cost: '', price: '', qty: '', supplierId: '' });
  const set = (k) => (e) => setF((prev) => ({ ...prev, [k]: e.target.value }));
  const canSave = f.name.trim().length > 0;
  return (
    <div className="mb-3 rounded-2xl border border-primary/20 bg-primary-50/50 p-3">
      <input value={f.name} onChange={set('name')} placeholder="Product name" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      <input value={f.barcode} onChange={set('barcode')} inputMode="numeric" placeholder="Barcode (optional)" className="mb-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      {suppliers.length > 0 && (
        <select value={f.supplierId} onChange={set('supplierId')} className="mb-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 focus:border-primary focus:outline-none">
          <option value="">Supplier (optional)</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      <div className="mb-2 grid grid-cols-3 gap-2">
        <input value={f.cost} onChange={set('cost')} inputMode="decimal" placeholder="Cost £" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <input value={f.price} onChange={set('price')} inputMode="decimal" placeholder="Sell £" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
        <input value={f.qty} onChange={set('qty')} inputMode="numeric" placeholder="Qty" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={!canSave} onClick={() => onAdd(f)} className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Save item</button>
        <button type="button" onClick={onCancel} className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600">Cancel</button>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }) {
  return (
    <div className="mt-6 flex flex-col items-center text-center">
      <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
        <PackagePlus className="h-7 w-7" strokeWidth={1.75} />
      </span>
      <p className="text-sm font-semibold text-gray-900">No stock yet</p>
      <p className="mt-1 max-w-xs text-sm text-gray-500">Add your first product, or use the Scan tab to book in a delivery.</p>
      <button type="button" onClick={onAdd} className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">Add a product</button>
    </div>
  );
}
